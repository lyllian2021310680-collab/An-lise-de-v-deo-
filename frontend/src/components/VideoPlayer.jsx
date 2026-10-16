import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { fileUrl } from "../lib/api";

let ytApiPromise = null;
const loadYouTubeApi = () => {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev && prev();
      resolve(window.YT);
    };
  });
  return ytApiPromise;
};

export const extractYouTubeId = (input) => {
  if (!input) return null;
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/|\/v\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
};

export const VideoPlayer = forwardRef(({ video, onTime, onReady, onDuration }, ref) => {
  const containerRef = useRef(null);
  const ytRef = useRef(null);
  const videoElRef = useRef(null);
  const rafRef = useRef(null);
  const [ready, setReady] = useState(false);

  const isYouTube = video?.source_type === "youtube";

  useImperativeHandle(ref, () => ({
    play: () => (isYouTube ? ytRef.current?.playVideo() : videoElRef.current?.play()),
    pause: () => (isYouTube ? ytRef.current?.pauseVideo() : videoElRef.current?.pause()),
    seekTo: (t) => {
      if (isYouTube) ytRef.current?.seekTo(t, true);
      else if (videoElRef.current) videoElRef.current.currentTime = t;
    },
    getCurrentTime: () =>
      isYouTube ? ytRef.current?.getCurrentTime?.() || 0 : videoElRef.current?.currentTime || 0,
    getDuration: () =>
      isYouTube ? ytRef.current?.getDuration?.() || 0 : videoElRef.current?.duration || 0,
    setRate: (r) => (isYouTube ? ytRef.current?.setPlaybackRate(r) : (videoElRef.current.playbackRate = r)),
    isPlaying: () =>
      isYouTube
        ? ytRef.current?.getPlayerState?.() === 1
        : videoElRef.current && !videoElRef.current.paused,
  }));

  // Time polling loop
  useEffect(() => {
    const tick = () => {
      const t = isYouTube ? ytRef.current?.getCurrentTime?.() : videoElRef.current?.currentTime;
      if (typeof t === "number") onTime && onTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isYouTube, onTime]);

  // YouTube init
  useEffect(() => {
    if (!isYouTube || !video?.youtube_id) return;
    let destroyed = false;
    loadYouTubeApi().then((YT) => {
      if (destroyed || !containerRef.current) return;
      ytRef.current = new YT.Player(containerRef.current, {
        videoId: video.youtube_id,
        playerVars: { rel: 0, modestbranding: 1, controls: 1, playsinline: 1 },
        events: {
          onReady: (e) => {
            setReady(true);
            onReady && onReady();
            onDuration && onDuration(e.target.getDuration());
          },
        },
      });
    });
    return () => {
      destroyed = true;
      try { ytRef.current?.destroy(); } catch (e) {}
      ytRef.current = null;
    };
  }, [isYouTube, video?.youtube_id]);

  if (isYouTube) {
    return (
      <div className="absolute inset-0 w-full h-full">
        <div ref={containerRef} className="w-full h-full" data-testid="youtube-player" />
      </div>
    );
  }

  return (
    <video
      ref={videoElRef}
      data-testid="html5-player"
      className="absolute inset-0 w-full h-full bg-black"
      src={video?.storage_path ? fileUrl(video.storage_path) : undefined}
      controls
      playsInline
      onLoadedMetadata={(e) => {
        setReady(true);
        onReady && onReady();
        onDuration && onDuration(e.target.duration);
      }}
    />
  );
});

VideoPlayer.displayName = "VideoPlayer";
