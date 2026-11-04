import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";

import type { GraphReplayStep } from "@/lib/graph-replay";
import { Button } from "@/components/ui/button";

interface BrainReplayControlsProps {
  steps: GraphReplayStep[];
  index: number;
  playing: boolean;
  replayMode: boolean;
  reducedMotion: boolean;
  speed: number;
  onIndexChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
  onReplayStart: () => void;
  onReplayExit: () => void;
}

function formatDate(timestamp: number | undefined): string {
  return timestamp === undefined
    ? "No dates"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(timestamp);
}

export function BrainReplayControls({
  steps,
  index,
  playing,
  replayMode,
  reducedMotion,
  speed,
  onIndexChange,
  onPlayingChange,
  onSpeedChange,
  onReplayStart,
  onReplayExit,
}: BrainReplayControlsProps) {
  const lastIndex = Math.max(steps.length - 1, 0);
  const current = steps[index];

  return (
    <section aria-label="Graph replay" className="brain-replay">
      <div className="brain-replay-heading">
        <div>
          <span className="eyebrow">Replay</span>
          <strong aria-live="polite">{formatDate(current?.timestamp)}</strong>
        </div>
        <div className="brain-replay-actions">
          <Button
            aria-label="Start replay from beginning"
            disabled={!steps.length}
            onClick={onReplayStart}
            size="sm"
            variant="outline"
          >
            Replay
          </Button>
          {reducedMotion ? (
            <>
              <Button
                aria-label="Previous replay step"
                disabled={index <= 0}
                onClick={() => onIndexChange(Math.max(0, index - 1))}
                size="icon-sm"
                variant="ghost"
              >
                <SkipBack aria-hidden="true" size={16} />
              </Button>
              <Button
                aria-label="Next replay step"
                disabled={index >= lastIndex}
                onClick={() => onIndexChange(Math.min(lastIndex, index + 1))}
                size="icon-sm"
                variant="ghost"
              >
                <SkipForward aria-hidden="true" size={16} />
              </Button>
            </>
          ) : (
            <Button
              aria-label={playing ? "Pause replay" : "Play replay"}
              disabled={!steps.length}
              onClick={() => onPlayingChange(!playing)}
              size="icon-sm"
              variant="ghost"
            >
              {playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
            </Button>
          )}
          {replayMode ? (
            <Button
              aria-label="Exit replay"
              onClick={onReplayExit}
              size="icon-sm"
              variant="ghost"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          ) : null}
          <label className="brain-replay-speed">
            Speed
            <select
              aria-label="Replay speed"
              onChange={(event) => onSpeedChange(Number(event.target.value))}
              value={speed}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </label>
        </div>
      </div>
      <input
        aria-label="Replay timeline"
        className="brain-replay-slider"
        disabled={!steps.length}
        max={lastIndex}
        min={0}
        onChange={(event) => {
          onPlayingChange(false);
          onIndexChange(Number(event.target.value));
        }}
        type="range"
        value={Math.min(index, lastIndex)}
      />
      <div className="brain-replay-dates">
        <span>{formatDate(steps[0]?.timestamp)}</span>
        <span>{reducedMotion ? "Step-through mode" : `${steps.length} moments`}</span>
        <span>{formatDate(steps[lastIndex]?.timestamp)}</span>
      </div>
    </section>
  );
}
