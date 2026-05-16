import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileImage,
  Fingerprint,
  Gauge,
  Keyboard,
  Lock,
  MonitorUp,
  Radar,
  ShieldAlert,
  Siren,
  Timer,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clamp, sample, shuffle } from "./lib/random";
import { completeSession, readStats, saveConfession, type Stats } from "./lib/storage";

type Stage = "intro" | "tasks" | "confession" | "employability" | "pushups" | "typing" | "proof" | "result";

type CaptchaTile = {
  id: string;
  src: string;
  label: string;
  employable: boolean;
};

const correctTaskOptions = [
  "answered emails",
  "opened assignment",
  "touched grass",
  "locked in",
  "submitted one assignment",
  "replied to a professor",
  "opened Canvas",
  "wrote a first sentence",
  "fixed one bug",
  "cleaned desktop",
  "finished a checklist item",
  "drank water and returned to work"
];

const wrongTaskOptions = [
  "watched productivity videos instead of being productive",
  "reorganized Notion instead of working",
  "stared at screen dramatically",
  "opened LinkedIn and felt inferior",
  "created a color-coded plan to avoid the real task",
  "made a study playlist for 47 minutes",
  "checked email to avoid replying to email",
  "opened the assignment then closed it respectfully",
  "researched pens for optimal focus",
  "watched a morning routine at 2 PM",
  "declared a fresh start tomorrow",
  "moved tabs between windows with intent"
];

const suspiciousWarnings = [
  "Response pattern indicates avoidance behavior.",
  "Productivity confidence score reduced.",
  "Behavioral inconsistency detected.",
  "Notion reorganization is not legally recognized as labor.",
  "Cognitive drift detected near dopamine perimeter."
];

const confessionPlaceholders = [
  "cs pset",
  "internship applications",
  "replying to my professor",
  "my entire future",
  "job applications",
  "opening Canvas",
  "emotional stability"
];

const typingPhrases = [
  "Doomscroll privileges must be earned. I will lock in, finish the task in front of me, and stop pretending that opening another tab counts as preparation.",
  "I will lock in for thirty honest seconds. Short form content can wait, my assignment cannot, and my future self deserves basic cooperation.",
  "Doomscroll privileges must be earned. I will type this sentence with focus, accept temporary discomfort, and return to the work I am avoiding."
];

const insults = [
  "Candidate exhibits premium avoidance architecture.",
  "LinkedIn aura below acceptable networking thresholds.",
  "Discipline instability detected.",
  "Behavioral integrity compromised.",
  "Short-form content dependency suspected.",
  "Your workflow has entered witness protection."
];

const stageOrder: Stage[] = ["intro", "tasks", "confession", "employability", "pushups", "typing", "proof", "result"];

function samuelImage() {
  return `${import.meta.env.BASE_URL}samuel.webp`;
}

type UnlockResult = { ok: boolean; tabId?: number };

function getVerificationTabId() {
  return new Promise<number | undefined>((resolve) => {
    const tabIdFromUrl = Number(new URLSearchParams(location.search).get("tabId"));
    if (Number.isFinite(tabIdFromUrl) && tabIdFromUrl >= 0) {
      resolve(tabIdFromUrl);
      return;
    }

    if (!("chrome" in window)) {
      resolve(undefined);
      return;
    }

    if (chrome.tabs?.getCurrent) {
      chrome.tabs.getCurrent((tab) => {
        if (chrome.runtime?.lastError) {
          resolve(undefined);
          return;
        }
        if (tab?.id != null) {
          resolve(tab.id);
          return;
        }
        chrome.tabs.query?.({ active: true, currentWindow: true }, ([activeTab]) => {
          resolve(activeTab?.id);
        });
      });
      return;
    }

    resolve(undefined);
  });
}

async function sendUnlock(score: number) {
  const tabId = await getVerificationTabId();
  return new Promise<UnlockResult>((resolve) => {
    if (!("chrome" in window) || !chrome.runtime?.sendMessage) {
      resolve({ ok: true, tabId });
      return;
    }

    chrome.runtime.sendMessage({ type: "PRODUCTIVITY_CAPTCHA_UNLOCK", score, tabId }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, tabId });
        return;
      }
      resolve({ ok: response?.ok !== false, tabId: response?.tabId ?? tabId });
    });
  });
}

async function proceedToBlockedSite(score: number, targetUrl: string) {
  const tabId = await getVerificationTabId();
  return new Promise<boolean>((resolve) => {
    if (!("chrome" in window) || !chrome.runtime?.sendMessage) {
      window.location.href = targetUrl;
      resolve(true);
      return;
    }

    chrome.runtime.sendMessage({ type: "PRODUCTIVITY_CAPTCHA_PROCEED", score, tabId, targetUrl }, (response) => {
      if (chrome.runtime.lastError || response?.ok === false) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

function sendBlocklist(hosts: string[]) {
  if (!("chrome" in window) || !chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ type: "PRODUCTIVITY_CAPTCHA_BLOCKLIST", hosts });
}

function formatTime(ms?: number) {
  if (!ms || ms < Date.now()) return "00:00";
  const total = Math.ceil((ms - Date.now()) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function useTicker() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-slate-300 bg-white shadow-[0_2px_6px_rgba(0,0,0,.16)] ${className}`}>
      {children}
    </div>
  );
}

function StatusPill({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "red" | "amber" }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return <span className={`inline-flex items-center gap-2 border px-3 py-1 text-xs ${toneClass}`}>{children}</span>;
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  tone = "green"
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "green" | "red";
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`group inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2 text-sm font-medium uppercase tracking-normal transition ${
        tone === "green"
          ? "bg-[#1a73e8] text-white hover:bg-[#1765cc]"
          : "bg-red-600 text-white hover:bg-red-700"
      } disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500`}
    >
      {children}
      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
    </button>
  );
}

function Meter({ label, value, tone = "green" }: { label: string; value: number; tone?: "green" | "red" | "amber" }) {
  const color = tone === "green" ? "bg-[#1a73e8]" : tone === "red" ? "bg-red-500" : "bg-amber-400";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase text-slate-500">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 border border-slate-200 bg-slate-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamp(value, 0, 100)}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );
}

function Header({ blockedUrl }: { blockedUrl: string | null }) {
  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 text-slate-700 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center border border-slate-300 bg-slate-50">
          <ShieldAlert className="h-5 w-5 text-[#4285f4]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800">CAUGHTCHA</div>
          <div className="truncate text-xs text-slate-500">{blockedUrl ? `Blocked page: ${blockedUrl}` : "Verification required"}</div>
        </div>
      </div>
    </header>
  );
}

function Layout({ stats, blockedUrl, children, plain = false }: { stats: Stats; blockedUrl: string | null; children: React.ReactNode; plain?: boolean }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f5f5f5] text-slate-900">
      <Header blockedUrl={blockedUrl} />
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-68px)] w-full max-w-7xl flex-col px-4 py-6 md:px-8">
        {children}
      </main>
    </div>
  );
}

function ProgressRail({ stage }: { stage: Stage }) {
  const index = stageOrder.indexOf(stage);
  return (
    <div className="mb-5 grid grid-cols-7 gap-1">
      {stageOrder.slice(1).map((item, i) => (
        <div key={item} className="h-1.5 bg-slate-200">
          <motion.div
            animate={{ width: i < index ? "100%" : i === index - 1 ? "55%" : "0%" }}
            className="h-full bg-[#1a73e8]"
          />
        </div>
      ))}
    </div>
  );
}

function Intro({ onNext }: { onNext: () => void }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center">
      <motion.section animate={{ opacity: 1, scale: 1 }} className="w-full max-w-[520px]">
        <div className="border border-slate-300 bg-white p-2 shadow-[0_2px_6px_rgba(0,0,0,.22)]">
          <div className="bg-[#1a73e8] p-5 text-white">
            <div className="text-sm leading-5">CAUGHTCHA</div>
            <div className="mt-1 text-3xl font-normal leading-9">Verify it is time to work</div>
            <div className="mt-2 text-sm leading-5">Complete behavioral verification to continue</div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-4 border border-slate-300 bg-[#fafafa] p-4">
              <button
                onClick={() => setChecked((value) => !value)}
                aria-pressed={checked}
                aria-label="I am productively available"
                className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 bg-white ${
                  checked ? "border-[#1a73e8] bg-blue-50" : "border-slate-400 hover:border-[#1a73e8]"
                }`}
              >
                {checked ? <Check className="h-5 w-5 text-[#1a73e8]" /> : <Fingerprint className="h-5 w-5 text-slate-500" />}
              </button>
              <div className="min-w-0">
                <div className="text-base text-slate-800">I am productively available</div>
                <div className="mt-1 text-xs text-slate-500">Behavioral verification may include task selection, typing, and image challenges.</div>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
              <div className="text-[11px] text-slate-400">Privacy - Terms</div>
              <button
                disabled={!checked}
                onClick={onNext}
                className="bg-[#1a73e8] px-6 py-2 text-sm font-medium uppercase text-white hover:bg-[#1765cc] disabled:bg-slate-300 disabled:text-slate-500"
              >
                Begin
              </button>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

function TaskVerification({ onNext }: { onNext: (score: number) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const challenge = useMemo(() => {
    const correctCount = 3 + Math.floor(Math.random() * 3);
    const correctLabels = shuffle(correctTaskOptions).slice(0, correctCount);
    const wrongLabels = shuffle(wrongTaskOptions).slice(0, 9 - correctCount);
    const options = shuffle([...correctLabels, ...wrongLabels]);
    return { options, correctLabels };
  }, []);

  const score = 88;
  const isCorrect =
    selected.length === challenge.correctLabels.length &&
    challenge.correctLabels.every((label) => selected.includes(label));

  function verify() {
    if (!isCorrect) {
      setFailed(true);
      return;
    }
    onNext(score);
  }

  return (
    <StageShell title="Daily Productivity Verification" icon={<ClipboardCheck />} sub="Select all tasks you have completed today.">
      <div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {challenge.options.map((task) => {
            const active = selected.includes(task);
            return (
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                key={task}
                onClick={() => {
                  setFailed(false);
                  setSelected((items) => (active ? items.filter((item) => item !== task) : [...items, task]));
                }}
                className={`min-h-28 border p-4 text-left transition ${
                  active
                    ? "border-[#1a73e8] bg-blue-50 text-slate-900"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                <div className={`mb-4 flex h-5 w-5 items-center justify-center border ${active ? "border-[#1a73e8] bg-[#1a73e8] text-white" : "border-slate-400 text-transparent"}`}>
                  {active && <Check className="h-3.5 w-3.5" />}
                </div>
                <div className="text-sm leading-5">{task}</div>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence>
          {failed && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-2">
              <div className="border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                Verification failed. Please try again.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-5 flex items-center justify-end">
          <PrimaryButton disabled={selected.length === 0} onClick={verify}>
            Verify
          </PrimaryButton>
        </div>
      </div>
    </StageShell>
  );
}

function ConfessionStage({ onNext }: { onNext: (severity: number) => void }) {
  const [text, setText] = useState("");
  const [scanning, setScanning] = useState(false);
  const placeholder = useRotatingText(confessionPlaceholders, 1600);
  const severity = clamp(text.trim().length * 4 + (text.toLowerCase().includes("future") ? 22 : 0), 12, 98);

  function submit() {
    setScanning(true);
    saveConfession(text.trim());
    window.setTimeout(() => onNext(severity), 2700);
  }

  return (
    <StageShell title="Behavioral Disclosure Form" icon={<ShieldAlert />} sub="What are you actively procrastinating right now?">
      <div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          className="min-h-64 w-full resize-none border border-slate-300 bg-white p-5 text-xl text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#1a73e8]"
        />
        {scanning && <div className="mt-4 text-xs text-slate-500">Checking response...</div>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Disclosure is mandatory. Honesty is computationally estimated.</span>
          <PrimaryButton disabled={text.trim().length < 2 || scanning} onClick={submit}>
            Verify
          </PrimaryButton>
        </div>
      </div>
    </StageShell>
  );
}

function EmployabilityCaptcha({ onNext }: { onNext: (score: number) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureStartedRef = useRef(false);
  const [streamReady, setStreamReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [tiles, setTiles] = useState<CaptchaTile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("Waiting for camera permission...");

  useEffect(() => {
    startCamera();
    return () => stopVideo(videoRef.current);
  }, []);

  async function startCamera() {
    if (captureStartedRef.current) return;
    captureStartedRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreamReady(true);
        setMessage("Camera accepted. Capturing challenge images...");
        await delay(450);
        await captureTiles();
      }
    } catch {
      captureStartedRef.current = false;
      setMessage("Camera permission is required for this challenge. Reload to try again.");
      setStreamReady(false);
    }
  }

  async function captureTiles() {
    if (!videoRef.current || tiles.length || capturing) return;
    setCapturing(true);
    setTiles([]);
    const labels = [
      "blinking",
      "staring",
      "confused expression",
      "gremlin posture",
      "mouth half open",
      "looking exhausted",
      "looking spiritually defeated",
      "miscellaneous aura collapse"
    ];
    const captures: CaptchaTile[] = [];
    for (let i = 0; i < 8; i += 1) {
      setMessage(`Capturing ${labels[i]}. Remain professionally concerned.`);
      setFlash(true);
      await delay(240);
      setFlash(false);
      captures.push({
        id: `user-${i}`,
        src: snapshot(videoRef.current, canvasRef.current),
        label: labels[i],
        employable: false
      });
      await delay(220);
    }
    const finished = shuffle([
      ...captures,
      { id: "samuel", src: samuelImage(), label: "Samuel", employable: true }
    ]);
    setTiles(finished);
    setCapturing(false);
    setMessage("Select all images containing employability.");
  }

  const correct = selected.length === 1 && tiles.find((tile) => selected.includes(tile.id))?.employable;
  const displayTiles: Array<CaptchaTile | null> = tiles.length ? tiles : Array.from({ length: 9 }, () => null);

  function verifyEmployability() {
    if (!correct) {
      setFailed(true);
      return;
    }
    onNext(68);
  }

  return (
    <StageShell title="Employability CAPTCHA" icon={<Camera />} sub="Cognitive workforce alignment test.">
      <div className="grid gap-5 lg:grid-cols-[390px_520px]">
        <div className="relative overflow-hidden border border-slate-300 bg-[#f9f9f9] p-4 text-slate-900 shadow-[0_2px_6px_rgba(0,0,0,.18)]">
          {flash && <div className="pointer-events-none absolute inset-0 z-20 animate-flash bg-white" />}
          <div className="aspect-video overflow-hidden border border-slate-300 bg-slate-200">
            <video ref={videoRef} muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
            {!streamReady && (
              <div className="absolute inset-4 flex items-center justify-center p-8 text-center text-sm text-slate-500">
                Camera access is required to continue.
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <p className="mt-4 text-sm leading-5 text-slate-500">{message}</p>
        </div>
        <div className="w-full border border-slate-300 bg-white p-2 font-sans text-slate-900 shadow-[0_2px_6px_rgba(0,0,0,.22)]">
          <div className="bg-[#1a73e8] p-5 text-white">
            <div className="text-sm leading-5">Select all squares with</div>
            <div className="mt-1 text-3xl font-normal leading-9">employability</div>
            <div className="mt-2 text-sm leading-5">If there are none, click skip</div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {displayTiles.map((tile, index) => {
              const id = tile ? tile.id : `empty-${index}`;
              const active = selected.includes(id);
              return (
                <button
                  key={id}
                  disabled={!tile}
                  aria-pressed={active}
                  onClick={() => {
                    setFailed(false);
                    setSelected((items) => (active ? items.filter((item) => item !== id) : [...items, id]));
                  }}
                  className={`relative aspect-square overflow-hidden bg-slate-100 transition ${
                    active ? "outline outline-[5px] outline-[#1a73e8] outline-offset-[-5px]" : "hover:brightness-95"
                  }`}
                >
                  {tile ? (
                    <>
                      <img src={tile.src} alt="" className={`h-full w-full object-cover transition ${active ? "scale-90" : ""}`} />
                      {active && (
                        <span className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-sm bg-[#1a73e8] text-white">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center p-3 text-center text-xs text-slate-400">image loading</div>
                  )}
                </button>
              );
            })}
          </div>
          {failed && (
            <div className="mt-2 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              Verification failed. Please try again.
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 px-2 py-3">
            <div className="flex items-center gap-4 text-slate-500">
              <button className="text-sm hover:text-slate-700" aria-label="Refresh challenge">↻</button>
              <button className="text-sm hover:text-slate-700" aria-label="Audio challenge">♫</button>
              <button className="text-sm hover:text-slate-700" aria-label="Help">?</button>
            </div>
            <button
              disabled={!tiles.length || !selected.length}
              onClick={verifyEmployability}
              className="bg-[#1a73e8] px-6 py-2 text-sm font-medium uppercase text-white hover:bg-[#1765cc] disabled:bg-slate-300 disabled:text-slate-500"
            >
              Verify
            </button>
          </div>
          <div className="px-2 pb-2 text-[11px] text-slate-400">
            recaptcha-style workforce readiness check
          </div>
        </div>
      </div>
    </StageShell>
  );
}

function PushupVerification({ onNext }: { onNext: (score: number) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<unknown>(null);
  const rafRef = useRef<number>();
  const startedRef = useRef(false);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const motionPhaseRef = useRef<"high" | "low">("low");
  const lastMotionRepAtRef = useRef(0);
  const upHoldStartedAtRef = useRef(0);
  const downHoldStartedAtRef = useRef(0);
  const startHoldCompleteRef = useRef(false);
  const downHoldCompleteRef = useRef(false);
  const [status, setStatus] = useState("Physical competence verification required.");
  const [ready, setReady] = useState(false);
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState<"up" | "down">("up");
  const [confidence, setConfidence] = useState(0);
  const [depthHistory, setDepthHistory] = useState<number[]>([]);
  const [holdLabel, setHoldLabel] = useState("Hold push-up position");
  const [holdProgress, setHoldProgress] = useState(0);
  const repsRef = useRef(0);
  const phaseRef = useRef<"up" | "down">("up");

  useEffect(() => {
    start();
    return () => {
      stopVideo(videoRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  async function start() {
    if (startedRef.current) return;
    startedRef.current = true;
    let cameraReady = false;
    try {
      setStatus("Waiting for camera permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      cameraReady = true;
      setReady(true);
      setStatus("Camera accepted. Loading pose detector...");
    } catch {
      startedRef.current = false;
      setStatus("Camera permission is required for this challenge. Reload to try again.");
      return;
    }

    try {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");
      const poseDetection = await import("@tensorflow-models/pose-detection");
      await tf.setBackend("webgl");
      await tf.ready();
      detectorRef.current = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
      });
      setReady(true);
      setStatus("Pose detector ready. Straighten arms in push-up position and hold for 3 seconds.");
      loop();
    } catch {
      if (!cameraReady) return;
      setStatus("Pose detector unavailable. Reload to try again.");
      fallbackLoop();
    }
  }

  async function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current as { estimatePoses: (video: HTMLVideoElement) => Promise<Array<{ keypoints: PosePoint[] }>> } | null;
    if (!video || !canvas || !detector) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    try {
      const poses = await detector.estimatePoses(video);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const keypoints = poses[0]?.keypoints ?? [];
      drawSkeleton(ctx, keypoints);
      analyzePushup(keypoints);
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setStatus("Pose tracking interrupted. Keep straight arms visible while detection recovers.");
      rafRef.current = requestAnimationFrame(loop);
    }
  }

  function fallbackLoop() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      rafRef.current = requestAnimationFrame(fallbackLoop);
      return;
    }
    const motionCanvas = motionCanvasRef.current ?? document.createElement("canvas");
    motionCanvasRef.current = motionCanvas;
    motionCanvas.width = 96;
    motionCanvas.height = 54;
    const ctx = motionCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
    const data = ctx.getImageData(0, 0, motionCanvas.width, motionCanvas.height).data;
    const previous = previousFrameRef.current;
    const gray = new Uint8ClampedArray(motionCanvas.width * motionCanvas.height);
    let motion = 0;
    let weightedY = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
      gray[p] = value;
      if (previous) {
        const diff = Math.abs(value - previous[p]);
        if (diff > 14) {
          motion += diff;
          weightedY += diff * Math.floor(p / motionCanvas.width);
        }
      }
    }

    previousFrameRef.current = gray;
    const motionScore = previous ? clamp(motion / 5200, 0, 100) : 0;
    const centerY = motion > 0 ? (weightedY / motion / motionCanvas.height) * 100 : 50;
    setConfidence(Math.max(38, motionScore));
    setDepthHistory((items) => [...items.slice(-56), centerY]);

    const now = Date.now();
    if (!detectorRef.current) {
      setHoldLabel("Waiting for pose detection");
      setHoldProgress(0);
      setStatus("Pose detection must be ready before the start hold can begin.");
      rafRef.current = requestAnimationFrame(fallbackLoop);
      return;
    }

    if (!startHoldCompleteRef.current) {
      setHoldLabel("Hold up position");
      if (motionScore < 10) {
        if (!upHoldStartedAtRef.current) upHoldStartedAtRef.current = now;
        const progress = clamp(((now - upHoldStartedAtRef.current) / 3000) * 100, 0, 100);
        setHoldProgress(progress);
        setStatus("Hold push-up position for 3 seconds before reps begin.");
        if (progress >= 100) {
          startHoldCompleteRef.current = true;
          setHoldProgress(0);
          setHoldLabel("Go down and hold");
          setStatus("Start approved. Go down and hold for 1 second.");
        }
      } else {
        upHoldStartedAtRef.current = 0;
        setHoldProgress(0);
        setStatus("Get still in push-up position to start the 3 second hold.");
      }
      rafRef.current = requestAnimationFrame(fallbackLoop);
      return;
    }

    if (motionScore > 34 && motionPhaseRef.current === "low") {
      motionPhaseRef.current = "high";
      setPhase("down");
      downHoldStartedAtRef.current = now;
      downHoldCompleteRef.current = false;
      setHoldLabel("Hold down position");
      setHoldProgress(0);
      setStatus("Down phase detected. Hold for 1 second.");
    }
    if (motionPhaseRef.current === "high") {
      const progress = clamp(((now - downHoldStartedAtRef.current) / 1000) * 100, 0, 100);
      setHoldProgress(progress);
      if (progress >= 100 && !downHoldCompleteRef.current) {
        downHoldCompleteRef.current = true;
        lastMotionRepAtRef.current = now;
        repsRef.current += 1;
        setReps(repsRef.current);
        setHoldLabel("Return up");
        setStatus(sample(["Rep accepted. Return to push-up position.", "Physical response verified. Return up.", "Down phase confirmed. Return up for the next rep."]));
      }
    }
    if (motionScore < 14 && motionPhaseRef.current === "high" && downHoldCompleteRef.current && now - lastMotionRepAtRef.current > 500) {
      motionPhaseRef.current = "low";
      downHoldStartedAtRef.current = 0;
      downHoldCompleteRef.current = false;
      setPhase("up");
      setHoldProgress(0);
      setHoldLabel("Go down and hold");
      setStatus("Up phase detected. Go down and hold for the next rep.");
    } else if (motionScore < 14 && motionPhaseRef.current === "high" && !downHoldCompleteRef.current) {
      motionPhaseRef.current = "low";
      downHoldStartedAtRef.current = 0;
      setPhase("up");
      setHoldProgress(0);
      setHoldLabel("Go down and hold");
      setStatus("Bottom hold was too short. Go down and hold for 1 second.");
    }

    rafRef.current = requestAnimationFrame(fallbackLoop);
  }

  function analyzePushup(keypoints: PosePoint[]) {
    const leftShoulder = getPoint(keypoints, "left_shoulder");
    const rightShoulder = getPoint(keypoints, "right_shoulder");
    const leftElbow = getPoint(keypoints, "left_elbow");
    const rightElbow = getPoint(keypoints, "right_elbow");
    const leftWrist = getPoint(keypoints, "left_wrist");
    const rightWrist = getPoint(keypoints, "right_wrist");
    const leftHip = getPoint(keypoints, "left_hip");
    const rightHip = getPoint(keypoints, "right_hip");
    const points = [leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist, leftHip, rightHip].filter(Boolean) as PosePoint[];
    const avgScore = points.reduce((sum, point) => sum + (point.score ?? 0), 0) / Math.max(1, points.length);
    setConfidence(avgScore * 100);
    if (avgScore < 0.16 || points.length < 5) {
      setStatus("Candidate partially outside frame. Suspiciously convenient.");
      return;
    }
    const usableAngles = [
      leftShoulder && leftElbow && leftWrist ? angle(leftShoulder, leftElbow, leftWrist) : null,
      rightShoulder && rightElbow && rightWrist ? angle(rightShoulder, rightElbow, rightWrist) : null
    ].filter((value): value is number => typeof value === "number");
    if (!usableAngles.length) {
      setStatus("Bring at least one arm into frame.");
      return;
    }
    const shoulders = [leftShoulder, rightShoulder].filter(Boolean) as PosePoint[];
    const wrists = [leftWrist, rightWrist].filter(Boolean) as PosePoint[];
    const hips = [leftHip, rightHip].filter(Boolean) as PosePoint[];
    const shoulderY = shoulders.reduce((sum, point) => sum + point.y, 0) / shoulders.length;
    const wristY = wrists.length ? wrists.reduce((sum, point) => sum + point.y, 0) / wrists.length : shoulderY;
    const hipY = hips.length ? hips.reduce((sum, point) => sum + point.y, 0) / hips.length : shoulderY + 80;
    const elbowAngle = Math.min(...usableAngles);
    const torsoDepth = Math.abs(hipY - shoulderY);
    const depth = clamp(((shoulderY - wristY) / Math.max(1, torsoDepth)) * 80 + (155 - elbowAngle), 0, 100);
    setDepthHistory((items) => [...items.slice(-56), depth]);
    const now = Date.now();
    const isUpPosition = elbowAngle > 168;
    const isDownPosition = elbowAngle < 162;

    if (!startHoldCompleteRef.current) {
      setHoldLabel("Hold up position");
      if (isUpPosition) {
        if (!upHoldStartedAtRef.current) upHoldStartedAtRef.current = now;
        const progress = clamp(((now - upHoldStartedAtRef.current) / 3000) * 100, 0, 100);
        setHoldProgress(progress);
        setStatus("Hold push-up position for 3 seconds before reps begin.");
        if (progress >= 100) {
          startHoldCompleteRef.current = true;
          setHoldProgress(0);
          setHoldLabel("Go down and hold");
          setStatus("Start approved. Go down and hold for 1 second.");
        }
      } else {
        upHoldStartedAtRef.current = 0;
        setHoldProgress(0);
        setStatus("Straighten into push-up position and hold for 3 seconds.");
      }
      return;
    }

    if (phaseRef.current === "up" && isDownPosition) {
      phaseRef.current = "down";
      setPhase("down");
      downHoldStartedAtRef.current = now;
      downHoldCompleteRef.current = false;
      setHoldLabel("Hold down position");
      setHoldProgress(0);
      setStatus("Down phase detected. Hold for 1 second.");
    }

    if (phaseRef.current === "down") {
      if (isDownPosition) {
        const progress = clamp(((now - downHoldStartedAtRef.current) / 1000) * 100, 0, 100);
        setHoldProgress(progress);
        if (progress >= 100 && !downHoldCompleteRef.current) {
          downHoldCompleteRef.current = true;
          repsRef.current += 1;
          setReps(repsRef.current);
          setHoldLabel("Return up");
          setStatus(sample(["Rep accepted. Return to push-up position.", "Down phase confirmed. Return up for the next rep.", "Physical response verified. Return up."]));
        }
      } else if (!downHoldCompleteRef.current) {
        phaseRef.current = "up";
        setPhase("up");
        downHoldStartedAtRef.current = 0;
        setHoldProgress(0);
        setHoldLabel("Go down and hold");
        setStatus("Bottom hold was too short. Hold down for 1 second.");
      }
    }

    if (phaseRef.current === "down" && downHoldCompleteRef.current && isUpPosition) {
      phaseRef.current = "up";
      setPhase("up");
      downHoldStartedAtRef.current = 0;
      downHoldCompleteRef.current = false;
      setHoldProgress(0);
      setHoldLabel("Go down and hold");
      setStatus("Up phase detected. Go down and hold for the next rep.");
    }
    if (phaseRef.current === "up" && elbowAngle > 162 && elbowAngle < 168) {
      setStatus("Almost down. Bend slightly more, then hold.");
    }
  }

  return (
    <StageShell title="Physical Capability Assessment" icon={<Activity />} sub="Sedentary behavior levels exceed recommended thresholds.">
      <div className="grid gap-5 lg:grid-cols-[1fr_390px]">
        <Panel className="relative overflow-hidden p-5">
          <div className="relative aspect-video overflow-hidden border border-slate-300 bg-slate-100">
            <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-70" />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full scale-x-[-1]" />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                Pose telemetry inactive
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-slate-500">Camera prompt starts automatically.</span>
            <StatusPill tone={phase === "down" ? "amber" : "green"}>Phase: {phase}</StatusPill>
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs uppercase text-slate-500">Reps required</div>
            <div className="mt-2 text-5xl font-semibold text-slate-900">{reps}/3</div>
          </div>
          <div className="mt-4 flex items-center gap-4 border border-slate-200 bg-white p-4">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(#1a73e8 ${holdProgress * 3.6}deg, #e2e8f0 0deg)`
              }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-lg font-semibold text-slate-800">
                {Math.ceil(((holdLabel.includes("up") ? 3000 : holdLabel.includes("down") ? 1000 : 0) * (100 - holdProgress)) / 1000 / 100)}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">{holdLabel}</div>
              <div className="mt-1 text-xs text-slate-500">
                {startHoldCompleteRef.current
                  ? "Hold the bottom for 1 second before returning up."
                  : "Hold push-up position for 3 seconds before reps can count."}
              </div>
            </div>
          </div>
          <p className="mt-4 min-h-10 text-xs leading-5 text-slate-600">{status}</p>
          <div className="mt-5">
            <PrimaryButton disabled={reps < 3} onClick={() => onNext(clamp(48 + reps * 12 + confidence * 0.15, 0, 100))}>
              Submit Physical Verification
            </PrimaryButton>
          </div>
        </Panel>
      </div>
    </StageShell>
  );
}

type PosePoint = { name?: string; score?: number; x: number; y: number };

function getPoint(points: PosePoint[], name: string) {
  return points.find((point) => point.name === name && (point.score ?? 0) > 0.15);
}

function angle(a: PosePoint, b: PosePoint, c: PosePoint) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return (Math.acos(clamp(dot / Math.max(mag, 1), -1, 1)) * 180) / Math.PI;
}

function drawSkeleton(ctx: CanvasRenderingContext2D, points: PosePoint[]) {
  const links = [
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_elbow"],
    ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"],
    ["left_shoulder", "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"]
  ];
  ctx.strokeStyle = "rgba(141,255,154,.85)";
  ctx.lineWidth = 4;
  for (const [a, b] of links) {
    const p1 = getPoint(points, a);
    const p2 = getPoint(points, b);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  for (const point of points) {
    if ((point.score ?? 0) < 0.2) continue;
    ctx.fillStyle = "rgba(255,61,61,.9)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function TypingTest({ onNext }: { onNext: (score: number) => void }) {
  const phrase = useMemo(() => sample(typingPhrases), []);
  const [input, setInput] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(30);
  useTicker();

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, 30 - Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [startedAt]);

  const correctChars = input.split("").filter((char, i) => char === phrase[i]).length;
  const accuracy = input.length ? (correctChars / input.length) * 100 : 100;
  const minutes = startedAt ? Math.max((Date.now() - startedAt) / 60000, 1 / 60) : 1 / 60;
  const wpm = Math.round(correctChars / 5 / minutes);
  const done = input === phrase && wpm >= 50 && remaining > 0;
  const failedSpeed = input === phrase && wpm < 50;
  const timedOut = remaining === 0 && input !== phrase;

  return (
    <StageShell title="Discipline Calibration" icon={<Keyboard />} sub="Monkeytype-grade compliance under psychological pressure.">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Panel className="p-5">
          <div className={`mb-5 border p-4 text-center ${remaining <= 10 ? "border-red-300 bg-red-50 text-red-700" : "border-[#1a73e8]/30 bg-blue-50 text-[#1a73e8]"}`}>
            <div className="text-xs font-medium uppercase">Time remaining</div>
            <div className="mt-1 text-7xl font-semibold leading-none tabular-nums">{remaining}</div>
            <div className="mt-1 text-xs">Minimum speed: 50 WPM</div>
          </div>
          <div className="mb-5 border border-slate-200 bg-slate-50 p-5 text-2xl leading-10 text-slate-500">
            {phrase.split("").map((char, index) => {
              const typed = input[index];
              const cls = typed == null ? "text-slate-400" : typed === char ? "text-[#1a73e8]" : "bg-red-500 text-white";
              return (
                <span key={`${char}-${index}`} className={cls}>
                  {char}
                </span>
              );
            })}
          </div>
          <input
            autoFocus
            value={input}
            onChange={(event) => {
              if (!startedAt) setStartedAt(Date.now());
              setInput(event.target.value.slice(0, phrase.length));
            }}
            disabled={remaining === 0}
            className="w-full border border-slate-300 bg-white p-4 text-xl text-slate-900 outline-none focus:border-[#1a73e8]"
            placeholder="Type the mandated affirmation..."
          />
          {accuracy < 82 && (
            <div className="mt-4 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {sample(["Discipline instability detected.", "Focus collapse imminent.", "Typing integrity compromised."])}
            </div>
          )}
          {failedSpeed && (
            <div className="mt-4 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              Minimum typing speed is 50 WPM. Doomscroll privileges remain suspended.
            </div>
          )}
          {timedOut && (
            <div className="mt-4 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              Time expired. Re-enter the chamber and lock in.
            </div>
          )}
        </Panel>
        <Panel className="p-5">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className={`border p-3 ${wpm >= 50 ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
              <div className="text-xs uppercase text-slate-500">WPM</div>
              <div className={`mt-2 text-4xl ${wpm >= 50 ? "text-[#1a73e8]" : "text-red-600"}`}>{wpm}</div>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase text-slate-500">ACC</div>
              <div className="mt-2 text-4xl text-amber-500">{Math.round(accuracy)}</div>
            </div>
          </div>
          <div className="mt-6">
            <PrimaryButton disabled={!done} onClick={() => onNext(clamp(accuracy * 0.75 + Math.min(wpm, 100) * 0.25, 0, 100))}>
              Finalize Discipline Assessment
            </PrimaryButton>
          </div>
        </Panel>
      </div>
    </StageShell>
  );
}

function ProofOfSuffering({ onFinish }: { onFinish: (score: number, denied: boolean) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  function onFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  function analyze() {
    setScanning(true);
    window.setTimeout(() => {
      onFinish(84, false);
    }, 1200);
  }

  return (
    <StageShell title="Proof of Suffering" icon={<Upload />} sub="Before access is granted, provide evidence of productive struggle.">
      <div>
        <div className="mb-5 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Finish something off your checklist, then upload a screenshot.
        </div>
        <label className="flex min-h-80 cursor-pointer flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 p-6 text-center hover:border-[#1a73e8]">
          {preview ? (
            <img src={preview} alt="Uploaded proof" className="max-h-72 max-w-full object-contain" />
          ) : (
            <>
              <FileImage className="h-12 w-12 text-slate-400" />
              <span className="mt-4 text-sm text-slate-500">Upload screenshot image</span>
            </>
          )}
          <input type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} className="hidden" />
        </label>
        {scanning && <div className="mt-4 text-xs text-slate-500">Checking upload...</div>}
        <div className="mt-5 flex justify-end">
          <PrimaryButton disabled={!preview || scanning} onClick={analyze}>
            Verify
          </PrimaryButton>
        </div>
      </div>
    </StageShell>
  );
}

function ResultStage({ denied, stats, blockedUrl }: { denied: boolean; stats: Stats; blockedUrl: string | null }) {
  const target = blockedUrl ?? "https://www.youtube.com/shorts";
  const [proceedError, setProceedError] = useState(false);
  async function proceed() {
    setProceedError(false);
    const ok = await proceedToBlockedSite(stats.workforceReadiness, target);
    if (!ok) {
      setProceedError(true);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <Panel className={`w-full max-w-3xl p-8 text-center ${denied ? "shadow-redline" : ""}`}>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border border-current text-current">
          {denied ? <Lock className="h-8 w-8 text-red-600" /> : <BadgeCheck className="h-8 w-8 text-[#1a73e8]" />}
        </div>
        <h2 className={`text-4xl font-semibold ${denied ? "text-red-600" : "text-[#1a73e8]"}`}>
          {denied ? "Request denied." : "Access granted."}
        </h2>
        <p className="mt-3 text-slate-600">
          {denied ? "You are clearly still capable of productivity." : "You may now consume content."}
        </p>
        {proceedError && (
          <div className="mx-auto mt-5 max-w-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            Could not unlock this tab. Reload the extension and try again.
          </div>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {!denied && (
            <button onClick={proceed} className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#1a73e8] px-5 py-2 text-sm font-medium uppercase text-white hover:bg-[#1765cc]">
              <MonitorUp className="h-4 w-4" /> Proceed under temporary supervision
            </button>
          )}
          <button onClick={() => location.reload()} className="min-h-11 border border-slate-300 bg-white px-5 py-2 text-sm font-medium uppercase text-slate-700 hover:bg-slate-50">
            Re-enter verification chamber
          </button>
        </div>
      </Panel>
    </div>
  );
}

function Dashboard({ stats, onStats }: { stats: Stats; onStats: (stats: Stats) => void }) {
  const [hosts, setHosts] = useState("tiktok.com\ninstagram.com\nyoutube.com/shorts\nx.com\nreddit.com\nnetflix.com");
  const insult = useMemo(() => sample(insults), [stats.insultsReceived]);

  function saveHosts() {
    const list = hosts.split("\n").map((host) => host.trim()).filter(Boolean);
    localStorage.setItem("productivityCaptcha.blockedHosts", JSON.stringify(list));
    sendBlocklist(list);
  }

  function receiveAssessment() {
    const next = { ...stats, insultsReceived: stats.insultsReceived + 1, behavioralIntegrity: clamp(stats.behavioralIntegrity - 2, 1, 99) };
    localStorage.setItem("productivityCaptcha.stats", JSON.stringify(next));
    onStats(next);
  }

  return (
    <Panel className="mt-5 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-sm uppercase text-white/70">Compliance dashboard</div>
          <div className="text-sm text-white/40">Streaks, fake assessments, and optional blocked-host configuration.</div>
        </div>
        <button onClick={receiveAssessment} className="border border-signal-red/40 bg-signal-red/10 px-4 py-2 font-mono text-xs uppercase text-signal-red">
          Generate personality assessment
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3 md:grid-cols-4">
          <StatBox label="Daily streak" value={stats.streak} />
          <StatBox label="Audits passed" value={stats.completions} />
          <StatBox label="Denials" value={stats.denialCount} />
          <StatBox label="Insults" value={stats.insultsReceived} />
        </div>
        <div className="border border-white/10 bg-white/[0.03] p-4 font-mono text-xs uppercase leading-5 text-white/55">
          {insult}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <textarea
          value={hosts}
          onChange={(event) => setHosts(event.target.value)}
          className="min-h-28 resize-y border border-white/10 bg-black/50 p-3 font-mono text-xs text-white/70 outline-none focus:border-signal-green/40"
        />
        <button onClick={saveHosts} className="border border-signal-green/45 bg-signal-green/10 px-5 py-3 font-mono text-xs uppercase text-signal-green">
          Save blocklist
        </button>
      </div>
    </Panel>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-white/10 bg-black/40 p-4">
      <div className="font-mono text-xs uppercase text-white/40">{label}</div>
      <div className="mt-2 font-mono text-3xl text-white">{value}</div>
    </div>
  );
}

function StageShell({
  title,
  sub,
  icon,
  children
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
      <div className="mb-0 border border-slate-300 bg-white p-2 shadow-[0_2px_6px_rgba(0,0,0,.18)]">
        <div className="bg-[#1a73e8] p-5 text-white">
          <div className="flex items-center gap-2 text-sm leading-5">
            <span className="flex h-7 w-7 items-center justify-center border border-white/40 bg-white/10">
              {icon}
            </span>
            Verification challenge
          </div>
          <h2 className="mt-2 text-3xl font-normal leading-9">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-white/90">{sub}</p>
        </div>
        <div className="p-4 md:p-5">{children}</div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>Privacy - Terms</span>
        </div>
      </div>
    </motion.section>
  );
}

export function App() {
  const [stage, setStage] = useState<Stage>("intro");
  const [stats, setStats] = useState(readStats);
  const [sessionScore, setSessionScore] = useState(52);
  const [denied, setDenied] = useState(false);
  const blockedUrl = useMemo(() => new URLSearchParams(location.search).get("blocked"), []);
  useTicker();

  function next(nextStage: Stage, scoreDelta = 0) {
    setSessionScore((score) => clamp((score + scoreDelta) / 2, 1, 99));
    setStage(nextStage);
  }

  function finish(score: number, isDenied: boolean) {
    const finalScore = clamp((sessionScore + score) / 2, 1, 99);
    const nextStats = completeSession(finalScore, isDenied);
    if (!isDenied) sendUnlock(finalScore);
    setDenied(isDenied);
    setStats(nextStats);
    setStage("result");
  }

  return (
    <Layout stats={stats} blockedUrl={blockedUrl} plain={stage === "intro"}>
      {stage !== "intro" && stage !== "result" && <ProgressRail stage={stage} />}
      <AnimatePresence mode="wait">
        {stage === "intro" && <Intro key="intro" onNext={() => setStage("tasks")} />}
        {stage === "tasks" && <TaskVerification key="tasks" onNext={(score) => next("confession", score)} />}
        {stage === "confession" && <ConfessionStage key="confession" onNext={(score) => next("employability", 100 - score)} />}
        {stage === "employability" && <EmployabilityCaptcha key="employability" onNext={(score) => next("pushups", score)} />}
        {stage === "pushups" && <PushupVerification key="pushups" onNext={(score) => next("typing", score)} />}
        {stage === "typing" && <TypingTest key="typing" onNext={(score) => next("proof", score)} />}
        {stage === "proof" && <ProofOfSuffering key="proof" onFinish={finish} />}
        {stage === "result" && <ResultStage key="result" denied={denied} stats={stats} blockedUrl={blockedUrl} />}
      </AnimatePresence>
    </Layout>
  );
}

function useRotatingText(items: string[], interval: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((value) => (value + 1) % items.length), interval);
    return () => clearInterval(id);
  }, [items.length, interval]);
  return items[index];
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function snapshot(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null) {
  if (!video || !canvas || !video.videoWidth) return samuelImage();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return samuelImage();
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.84);
}

function stopVideo(video: HTMLVideoElement | null) {
  const stream = video?.srcObject as MediaStream | null;
  stream?.getTracks().forEach((track) => track.stop());
}
