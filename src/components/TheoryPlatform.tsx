"use client";

import {
  ArrowClockwise,
  BookOpen,
  CheckCircle,
  FlagCheckered,
  Gauge,
  GraduationCap,
  ListChecks,
  Timer,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { questions, type Question } from "@/data/questions";

type Mode = "study" | "practice" | "exam";
type Status = "answering" | "review";

const EXAM_SIZE = 20;
const EXAM_SECONDS = 20 * 60;
const PASSING_SCORE = 18;

function shuffle<T>(items: T[]) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function getStoredProgress() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem("drive-theory-progress") ?? "{}") as Record<
      string,
      boolean
    >;
  } catch {
    return {};
  }
}

export function TheoryPlatform() {
  const [mode, setMode] = useState<Mode>("exam");
  const [deck, setDeck] = useState<Question[]>(() => questions.slice(0, EXAM_SIZE));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status>("answering");
  const [secondsLeft, setSecondsLeft] = useState(EXAM_SECONDS);
  const [mastered, setMastered] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const loader = window.setTimeout(() => setMastered(getStoredProgress()), 0);
    return () => window.clearTimeout(loader);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("drive-theory-progress", JSON.stringify(mastered));
  }, [mastered]);

  useEffect(() => {
    if (mode !== "exam" || status !== "answering") {
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          setStatus("review");
          return 0;
        }

        return value - 1;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [mode, secondsLeft, status]);

  const currentQuestion = deck[currentIndex];
  const answeredCount = deck.filter((question) => answers[question.id] !== undefined).length;
  const score = deck.reduce((total, question) => {
    return answers[question.id] === question.correctIndex ? total + 1 : total;
  }, 0);
  const mistakes = answeredCount - score;
  const progressPercent = Math.round((answeredCount / deck.length) * 100);
  const isFinished = status === "review";
  const isPassing = score >= PASSING_SCORE;

  const categoryRows = useMemo(() => {
    const total = questions.length;
    const learned = questions.filter((question) => mastered[question.id]).length;
    return [{ name: "Загальні положення", total, learned }];
  }, [mastered]);

  function reset(nextMode = mode) {
    const nextDeck =
      nextMode === "study" ? questions : shuffle(questions).slice(0, EXAM_SIZE);

    setMode(nextMode);
    setDeck(nextDeck);
    setCurrentIndex(0);
    setAnswers({});
    setStatus("answering");
    setSecondsLeft(EXAM_SECONDS);
  }

  function selectMode(nextMode: Mode) {
    reset(nextMode);
  }

  function chooseAnswer(optionIndex: number) {
    if (isFinished) {
      return;
    }

    setAnswers((value) => ({
      ...value,
      [currentQuestion.id]: optionIndex,
    }));

    if (mode !== "exam" && optionIndex === currentQuestion.correctIndex) {
      setMastered((value) => ({ ...value, [currentQuestion.id]: true }));
    }
  }

  function finish() {
    setStatus("review");
    setMastered((value) => {
      const next = { ...value };
      deck.forEach((question) => {
        if (answers[question.id] === question.correctIndex) {
          next[question.id] = true;
        }
      });
      return next;
    });
  }

  const modeConfig = {
    study: {
      label: "Study",
      icon: BookOpen,
      helper: "All available questions, instant feedback, saved mastery.",
    },
    practice: {
      label: "Practice",
      icon: GraduationCap,
      helper: "20 random questions without the official timer pressure.",
    },
    exam: {
      label: "Exam",
      icon: Timer,
      helper: "Ukraine format: 20 questions, 20 minutes, pass from 18.",
    },
  } satisfies Record<Mode, { label: string; icon: typeof BookOpen; helper: string }>;

  return (
    <main className="min-h-[100dvh] bg-[#f6f4ef] text-stone-950">
      <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-4 py-4 md:grid-cols-[300px_minmax(0,1fr)] md:px-6 lg:py-6">
        <aside className="rounded-[2rem] border border-stone-200 bg-[#fbfaf7] p-4 shadow-[0_24px_60px_-38px_rgba(55,45,32,0.45)] md:sticky md:top-6 md:h-[calc(100dvh-3rem)]">
          <div className="flex h-full flex-col gap-5">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-stone-900 text-white">
                  <Gauge size={22} weight="duotone" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-500">Ukraine theory</p>
                  <h1 className="text-2xl font-semibold tracking-tight">Drive Drill</h1>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
              {(Object.keys(modeConfig) as Mode[]).map((item) => {
                const Icon = modeConfig[item].icon;
                const active = mode === item;

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => selectMode(item)}
                    className={`group rounded-2xl border p-3 text-left transition duration-300 active:scale-[0.98] ${
                      active
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-200 bg-white text-stone-800 hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Icon size={20} weight="duotone" />
                      {active ? <CheckCircle size={18} weight="fill" /> : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold">{modeConfig[item].label}</p>
                    <p
                      className={`mt-1 hidden text-xs leading-5 md:block ${
                        active ? "text-stone-300" : "text-stone-500"
                      }`}
                    >
                      {modeConfig[item].helper}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Metric label="Answered" value={`${answeredCount}/${deck.length}`} />
              <Metric label="Mistakes" value={String(mistakes)} tone={mistakes > 2 ? "bad" : "ok"} />
              <Metric label="Score" value={`${score}/${deck.length}`} />
              <Metric label="Time" value={mode === "exam" ? formatTime(secondsLeft) : "Free"} />
            </div>

            <div className="mt-auto rounded-3xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Question bank</p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Seeded from the supplied 2025 PDF, Section 1.
                  </p>
                </div>
                <ListChecks size={22} className="text-emerald-700" weight="duotone" />
              </div>
              <div className="mt-4 space-y-3">
                {categoryRows.map((row) => (
                  <div key={row.name}>
                    <div className="flex justify-between text-xs font-medium">
                      <span>{row.name}</span>
                      <span>
                        {row.learned}/{row.total}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-emerald-700 transition-all"
                        style={{ width: `${Math.round((row.learned / row.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="rounded-[2rem] border border-stone-200 bg-[#fbfaf7] p-4 shadow-[0_24px_60px_-38px_rgba(55,45,32,0.35)] sm:p-6 lg:p-8">
            <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-stone-500">
                  {currentQuestion.category} · #{currentQuestion.number}
                </p>
                <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                  {currentQuestion.question}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 transition hover:border-stone-300 active:scale-[0.98]"
              >
                <ArrowClockwise size={18} />
                Reset
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              {currentQuestion.options.map((option, optionIndex) => {
                const selected = answers[currentQuestion.id] === optionIndex;
                const correct = currentQuestion.correctIndex === optionIndex;
                const reveal = isFinished || (mode !== "exam" && selected);
                const stateClass =
                  reveal && correct
                    ? "border-emerald-600 bg-emerald-50"
                    : reveal && selected && !correct
                      ? "border-red-500 bg-red-50"
                      : selected
                        ? "border-stone-900 bg-stone-100"
                        : "border-stone-200 bg-white hover:border-stone-300";

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => chooseAnswer(optionIndex)}
                    className={`grid min-h-16 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-3 text-left transition duration-300 active:scale-[0.99] sm:p-4 ${stateClass}`}
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-stone-900 text-sm font-semibold text-white">
                      {optionIndex + 1}
                    </span>
                    <span className="text-sm leading-6 text-stone-800 sm:text-base">{option}</span>
                  </button>
                );
              })}
            </div>

            {(mode !== "exam" || isFinished) && answers[currentQuestion.id] !== undefined ? (
              <div className="mt-5 rounded-3xl border border-stone-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  {answers[currentQuestion.id] === currentQuestion.correctIndex ? (
                    <CheckCircle size={23} weight="fill" className="mt-0.5 text-emerald-700" />
                  ) : (
                    <WarningCircle size={23} weight="fill" className="mt-0.5 text-red-600" />
                  )}
                  <p className="text-sm leading-6 text-stone-700">{currentQuestion.explanation}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 sm:max-w-xs">
                <div
                  className="h-full rounded-full bg-stone-900 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
                  disabled={currentIndex === 0}
                  className="h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold transition hover:border-stone-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                {currentIndex === deck.length - 1 ? (
                  <button
                    type="button"
                    onClick={finish}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 active:scale-[0.98]"
                  >
                    <FlagCheckered size={18} />
                    Finish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((value) => Math.min(deck.length - 1, value + 1))
                    }
                    className="h-11 rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 active:scale-[0.98]"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[2rem] border border-stone-200 bg-[#fbfaf7] p-5 shadow-[0_24px_60px_-38px_rgba(55,45,32,0.35)]">
              <p className="text-sm font-semibold text-stone-500">Official simulation</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <CompactMetric label="Questions" value="20" />
                <CompactMetric label="Minutes" value="20" />
                <CompactMetric label="Pass" value="18" />
              </div>
              {isFinished ? (
                <div
                  className={`mt-4 rounded-2xl p-4 ${
                    isPassing ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"
                  }`}
                >
                  <p className="text-sm font-semibold">
                    {isPassing ? "Passed simulation" : "Not passed yet"}
                  </p>
                  <p className="mt-1 text-sm leading-6">
                    Final score: {score}/{deck.length}. Maximum allowed mistakes: 2.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-[#fbfaf7] p-5">
              <p className="text-sm font-semibold text-stone-500">Navigator</p>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {deck.map((question, index) => {
                  const picked = answers[question.id];
                  const active = index === currentIndex;
                  const done = picked !== undefined;
                  const wrong = done && picked !== question.correctIndex;

                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => setCurrentIndex(index)}
                      className={`grid aspect-square place-items-center rounded-xl border text-xs font-semibold transition active:scale-[0.96] ${
                        active
                          ? "border-stone-900 bg-stone-900 text-white"
                          : wrong && isFinished
                            ? "border-red-200 bg-red-50 text-red-700"
                            : done
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-stone-200 bg-white text-stone-500"
                      }`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-stone-900 p-5 text-white">
              <p className="text-sm font-semibold text-stone-300">Release scope</p>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                Current bank: {questions.length} normalized questions. The app is ready for Vercel;
                expanding the bank means appending records to <span className="font-mono">questions.ts</span>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "bad";
}) {
  const color =
    tone === "bad" ? "text-red-700" : tone === "ok" ? "text-emerald-700" : "text-stone-950";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 text-center">
      <p className="font-mono text-lg font-semibold text-stone-950">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-stone-500">{label}</p>
    </div>
  );
}
