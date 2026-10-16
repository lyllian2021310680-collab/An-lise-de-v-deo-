"""Regras de pontuação configuráveis por set e análise do andamento da partida."""
from typing import Any, Dict, List


def default_set_rules(sets_to_win: int) -> List[Dict[str, int]]:
    n = max(1, 2 * sets_to_win - 1)
    return [{"target": 25, "min_diff": 2} for _ in range(n - 1)] + [{"target": 15, "min_diff": 2}]


def rules_of(video: Dict[str, Any]) -> Dict[str, Any]:
    stw = int(video.get("sets_to_win") or 3)
    sets = video.get("set_rules") or default_set_rules(stw)
    return {"sets_to_win": stw, "set_rules": [{"target": int(s["target"]), "min_diff": int(s.get("min_diff") or 2)} for s in sets]}


def rule_for(rules: Dict[str, Any], set_number: int) -> Dict[str, int]:
    sets = rules["set_rules"]
    return sets[min(set_number, len(sets)) - 1]


def set_closed(score: Dict[str, int], rule: Dict[str, int]) -> bool:
    hi, lo = max(score["nos"], score["adv"]), min(score["nos"], score["adv"])
    return hi >= rule["target"] and hi - lo >= rule["min_diff"]


def _apply(score: Dict[str, int], winner: str):
    if winner in ("nos", "adv"):
        score[winner] += 1


def analyze(rallies: List[Dict[str, Any]], rules: Dict[str, Any]) -> Dict[str, Any]:
    """rallies: pontos ordenados por número. Retorna campos por rali + resumo da partida."""
    stw = rules["sets_to_win"]
    per: Dict[str, Dict[str, Any]] = {r["id"]: {"review_reasons": []} for r in rallies}

    # 1) Divisão proposta pelas regras (respeita sets travados manualmente)
    cur, sc, won, over = 1, {"nos": 0, "adv": 0}, {"nos": 0, "adv": 0}, False
    for r in rallies:
        p = per[r["id"]]
        if r.get("set_manual") and r.get("set_number") and r["set_number"] != cur:
            cur, sc = int(r["set_number"]), {"nos": 0, "adv": 0}
        if over:
            p["review_reasons"].append("Rali registrado após o fim da partida pela configuração")
        p["proposed_set"] = cur
        _apply(sc, r.get("winner"))
        if set_closed(sc, rule_for(rules, cur)):
            won["nos" if sc["nos"] > sc["adv"] else "adv"] += 1
            if max(won.values()) >= stw:
                over = True
            cur, sc = cur + 1, {"nos": 0, "adv": 0}

    # 2) Placar pela divisão atual (armazenada)
    running: Dict[int, Dict[str, int]] = {}
    closed_at: Dict[int, str] = {}
    for r in rallies:
        s = int(r.get("set_number") or 1)
        p = per[r["id"]]
        score = running.setdefault(s, {"nos": 0, "adv": 0})
        p["score_before"] = dict(score)
        _apply(score, r.get("winner"))
        p["score_after"] = dict(score)
        p["closes_set"] = False
        if s in closed_at:
            p["review_reasons"].append(f"O set {s} já estava encerrado pela regra configurada")
        elif set_closed(score, rule_for(rules, s)):
            closed_at[s] = r["id"]
            p["closes_set"] = True
        if r.get("winner") not in ("nos", "adv"):
            p["review_reasons"].append("Resultado do rali pendente de revisão")
        if not r.get("set_manual") and p["proposed_set"] != s:
            p["review_reasons"].append(f"Pela regra configurada, este rali pertence ao set {p['proposed_set']} (está no set {s})")
    for r in rallies:
        p = per[r["id"]]
        p["review_reasons"] = list(dict.fromkeys(p["review_reasons"]))
        p["needs_review"] = bool(p["review_reasons"])

    # 3) Resumo
    sets_out, sets_won, match_winner = [], {"nos": 0, "adv": 0}, None
    for s in sorted(running):
        rs = [r for r in rallies if int(r.get("set_number") or 1) == s]
        sc = running[s]
        rule = rule_for(rules, s)
        finished = s in closed_at
        winner = ("nos" if sc["nos"] > sc["adv"] else "adv") if finished else None
        if winner and not match_winner:
            sets_won[winner] += 1
            if sets_won[winner] >= stw:
                match_winner = winner
        ts = [x for r in rs for x in (r.get("start_ts"), r.get("end_ts")) if x is not None]
        sets_out.append({
            "number": s, "target": rule["target"], "min_diff": rule["min_diff"],
            "nos": sc["nos"], "adv": sc["adv"], "finished": finished, "winner": winner,
            "rallies": len(rs), "start_ts": min(ts) if ts else None, "end_ts": max(ts) if ts else None,
            "review": sum(1 for r in rs if per[r["id"]]["needs_review"]),
        })
    if rallies:
        last_set = int(rallies[-1].get("set_number") or 1)
        current_set = last_set + 1 if (last_set in closed_at and not match_winner) else last_set
    else:
        current_set = 1
    return {
        "per_rally": per,
        "summary": {
            **rules, "sets": sets_out, "sets_won": sets_won, "match_winner": match_winner,
            "match_finished": match_winner is not None, "current_set": current_set,
            "total_rallies": len(rallies),
            "review_count": sum(1 for p in per.values() if p["needs_review"]),
            "proposal_count": sum(1 for r in rallies if not r.get("set_manual") and per[r["id"]]["proposed_set"] != int(r.get("set_number") or 1)),
        },
    }
