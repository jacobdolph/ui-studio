import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "uistudio.music";
const SRC = `${import.meta.env.BASE_URL}wow-forever-dum-dum.m4a`;

function savedPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Opt-in background music: a looping track that only plays after the user turns it on.
 * The audio file is not fetched until then. The choice is remembered per browser; if it was
 * on last time we try to resume, and when the browser blocks sound before any interaction we
 * resume on the first click or key press instead.
 */
export function MusicToggle() {
  const audio = useRef<HTMLAudioElement>(null);
  const [wanted, setWanted] = useState(savedPreference);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    if (!wanted) {
      el.pause();
      return;
    }
    let armed = false;
    const resume = () => {
      armed = false;
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      void el.play().catch(() => setWanted(false));
    };
    void el.play().catch(() => {
      // Autoplay with sound is blocked until the page has been interacted with.
      armed = true;
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
    });
    return () => {
      if (armed) {
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      }
    };
  }, [wanted]);

  const toggle = () => {
    const next = !wanted;
    setWanted(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* private mode: just don't remember */
    }
  };

  const label = wanted ? "Music on. Click to stop" : "Play some music while you work";
  return (
    <>
      <button
        className={`music ${wanted ? "on" : ""}`}
        onClick={toggle}
        aria-pressed={wanted}
        title={`${label} — “World of Warcraft Forever (dum dum)”, made with Suno`}
      >
        <span aria-hidden="true">{wanted ? "♫" : "♪"}</span>
        <span className="music-label">{wanted ? (playing ? "Playing" : "Music") : "Music"}</span>
      </button>
      <audio
        ref={audio}
        src={SRC}
        preload="none"
        loop
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </>
  );
}
