import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

export const fileUrl = (storagePath) => `${API}/files/${storagePath}`;

// Videos
export const getVideos = () => client.get("/videos").then((r) => r.data);
export const getVideo = (id) => client.get(`/videos/${id}`).then((r) => r.data);
export const createVideo = (body) => client.post("/videos", body).then((r) => r.data);
export const updateVideo = (id, body) => client.put(`/videos/${id}`, body).then((r) => r.data);
export const setVideoStatus = (id, status) => client.patch(`/videos/${id}/status?status=${status}`).then((r) => r.data);
export const deleteVideo = (id) => client.delete(`/videos/${id}`).then((r) => r.data);

// Upload
export const uploadFile = (file, kind = "video", onProgress) => {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return client
    .post("/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded * 100) / e.total)),
    })
    .then((r) => r.data);
};

// Athletes
export const getAthletes = () => client.get("/athletes").then((r) => r.data);
export const getAthlete = (id) => client.get(`/athletes/${id}`).then((r) => r.data);
export const createAthlete = (body) => client.post("/athletes", body).then((r) => r.data);
export const updateAthlete = (id, body) => client.put(`/athletes/${id}`, body).then((r) => r.data);
export const deleteAthlete = (id) => client.delete(`/athletes/${id}`).then((r) => r.data);

// Positions
export const getPositions = () => client.get("/positions").then((r) => r.data);
export const createPosition = (body) => client.post("/positions", body).then((r) => r.data);
export const updatePosition = (id, body) => client.put(`/positions/${id}`, body).then((r) => r.data);
export const deletePosition = (id) => client.delete(`/positions/${id}`).then((r) => r.data);

// Formations
export const getFormations = () => client.get("/formations").then((r) => r.data);
export const createFormation = (body) => client.post("/formations", body).then((r) => r.data);
export const updateFormation = (id, body) => client.put(`/formations/${id}`, body).then((r) => r.data);
export const deleteFormation = (id) => client.delete(`/formations/${id}`).then((r) => r.data);

// Rallies
export const getRallies = (videoId) => client.get("/rallies", { params: videoId ? { video_id: videoId } : {} }).then((r) => r.data);
export const linkRally = (body) => client.post("/rallies/link", body).then((r) => r.data);
export const deleteRally = (id) => client.delete(`/rallies/${id}`).then((r) => r.data);

// Archive
export const archiveFundamento = (id, archived) => client.patch(`/fundamentos/${id}/archive?archived=${archived}`).then((r) => r.data);
export const archiveClassificacao = (id, archived) => client.patch(`/classificacoes/${id}/archive?archived=${archived}`).then((r) => r.data);

// AI
export const aiAnalyze = (body) => client.post("/ai/analyze", body).then((r) => r.data);

// Fundamentos
export const getFundamentos = () => client.get("/fundamentos").then((r) => r.data);
export const createFundamento = (body) => client.post("/fundamentos", body).then((r) => r.data);
export const updateFundamento = (id, body) => client.put(`/fundamentos/${id}`, body).then((r) => r.data);
export const deleteFundamento = (id) => client.delete(`/fundamentos/${id}`).then((r) => r.data);

// Classificacoes
export const getClassificacoes = (fundamentoId) =>
  client.get("/classificacoes", { params: fundamentoId ? { fundamento_id: fundamentoId } : {} }).then((r) => r.data);
export const createClassificacao = (body) => client.post("/classificacoes", body).then((r) => r.data);
export const updateClassificacao = (id, body) => client.put(`/classificacoes/${id}`, body).then((r) => r.data);
export const deleteClassificacao = (id) => client.delete(`/classificacoes/${id}`).then((r) => r.data);

// Actions
export const getActions = (params = {}) => client.get("/actions", { params }).then((r) => r.data);
export const createAction = (body) => client.post("/actions", body).then((r) => r.data);
export const updateAction = (id, body) => client.put(`/actions/${id}`, body).then((r) => r.data);
export const updateAnnotations = (id, annotations) =>
  client.patch(`/actions/${id}/annotations`, { annotations }).then((r) => r.data);
export const deleteAction = (id) => client.delete(`/actions/${id}`).then((r) => r.data);

// Saved filters
export const getSavedFilters = () => client.get("/saved-filters").then((r) => r.data);
export const createSavedFilter = (body) => client.post("/saved-filters", body).then((r) => r.data);
export const deleteSavedFilter = (id) => client.delete(`/saved-filters/${id}`).then((r) => r.data);

// Settings
export const getSettings = () => client.get("/settings").then((r) => r.data);
export const updateSettings = (body) => client.put("/settings", body).then((r) => r.data);

export const exportCsvUrl = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return `${API}/export/csv${q ? `?${q}` : ""}`;
};

// Categorias
export const getCategorias = () => client.get("/categorias").then((r) => r.data);
export const createCategoria = (body) => client.post("/categorias", body).then((r) => r.data);
export const updateCategoria = (id, body) => client.put(`/categorias/${id}`, body).then((r) => r.data);
export const deleteCategoria = (id) => client.delete(`/categorias/${id}`).then((r) => r.data);
export const archiveCategoria = (id, archived) => client.patch(`/categorias/${id}/archive?archived=${archived}`).then((r) => r.data);

// Equipes
export const getEquipes = () => client.get("/equipes").then((r) => r.data);
export const createEquipe = (body) => client.post("/equipes", body).then((r) => r.data);
export const updateEquipe = (id, body) => client.put(`/equipes/${id}`, body).then((r) => r.data);
export const deleteEquipe = (id) => client.delete(`/equipes/${id}`).then((r) => r.data);
export const archiveEquipe = (id, archived) => client.patch(`/equipes/${id}/archive?archived=${archived}`).then((r) => r.data);

// Stats / summary / compare
export const getStats = (params = {}) => client.get("/stats", { params }).then((r) => r.data);
export const getAthleteSummary = (id) => client.get(`/athletes/${id}/summary`).then((r) => r.data);
export const compareGroups = (groups) => client.post("/compare", { groups }).then((r) => r.data);

// K-phases (modelos táticos)
export const getKphases = (model) => client.get("/kphases", { params: model ? { model } : {} }).then((r) => r.data);
export const createKphase = (body) => client.post("/kphases", body).then((r) => r.data);
export const updateKphase = (id, body) => client.put(`/kphases/${id}`, body).then((r) => r.data);
export const deleteKphase = (id) => client.delete(`/kphases/${id}`).then((r) => r.data);

// Sugestão automática de fase
export const suggestPhase = (body) => client.post("/suggest-phase", body).then((r) => r.data);

// Rallies & placar
export const closePoint = (body) => client.post("/rallies/close-point", body).then((r) => r.data);
export const setRallyWinner = (id, winner) => client.put(`/rallies/${id}/winner`, { winner }).then((r) => r.data);
export const removePoint = (id, body) => client.post(`/rallies/${id}/remove-point`, body).then((r) => r.data);
export const reattachAction = (id) => client.patch(`/actions/${id}/attach`).then((r) => r.data);
export const setVideoOriginal = (id, storage_path) => client.patch(`/videos/${id}/original`, { storage_path }).then((r) => r.data);
export const getMatch = (videoId) => client.get(`/videos/${videoId}/match`).then((r) => r.data);
export const saveMatchRules = (videoId, body) => client.put(`/videos/${videoId}/rules`, body).then((r) => r.data);
export const applyProposedSets = (videoId) => client.post(`/videos/${videoId}/apply-proposed-sets`).then((r) => r.data);
export const editRally = (id, body) => client.put(`/rallies/${id}`, body).then((r) => r.data);
export const getRalliesFull = (videoId) => client.get(`/videos/${videoId}/rallies-full`).then((r) => r.data);

export default client;
