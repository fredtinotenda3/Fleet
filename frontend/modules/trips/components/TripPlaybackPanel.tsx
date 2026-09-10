// frontend/modules/trips/components/TripPlaybackPanel.tsx
//
// Trip playback: the route, a playhead, and transport controls.
//
// ---------------------------------------------------------------------
// WHAT IT WILL NOT DO
// ---------------------------------------------------------------------
// It will not draw a route that was not measured. Every position on the
// line came from a stored telematics reading; the playhead interpolates
// BETWEEN two readings (the vehicle was at A and then at B, so it was
// somewhere on that segment) and never past either end. Speed and
// heading are shown as REPORTED, never blended, and are blank when the
// reading did not carry them -- `0 km/h` reads as stopped and a heading
// of 0 points due north, which is why the server refuses to default
// them.
//
// And it will not present an empty map as though nothing interesting
// happened. All three of the endpoint's `emptyReason` values are real
// and each gets its own explanation: a hand-entered trip has no clock
// times to replay, a trip whose plate no longer resolves has no device
// history, and a tracker that was offline reported nothing. A blank map
// with no caption is the silence this codebase has been bitten by
// repeatedly.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Pause, Play, RotateCcw, MapPinOff, AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/frontend/shared/ui/feedback/alert';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { describeQueryError } from '@/frontend/shared/ui/patterns';
import { formatDate } from '@/shared/utils/date.utils';

import { useTripPlayback } from '../hooks/useTrips';
import {
  EMPTY_REASON_COPY,
  PLAYBACK_SPEEDS,
  advanceOffset,
  formatElapsed,
  frameAtOffset,
  playbackRange,
  type PlaybackSpeed,
} from '../utils/playback';

// Leaflet evaluates `window` at import time, so the map is client-only.
// Same pattern (and same reason) as LiveMapPage's dynamic import.
const TripPlaybackMap = dynamic(
  () => import('./TripPlaybackMap').then((mod) => mod.TripPlaybackMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full text-body-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

interface TripPlaybackPanelProps {
  tripId: string;
  vehicleType?: string | null;
}

export function TripPlaybackPanel({ tripId, vehicleType }: TripPlaybackPanelProps) {
  const { data, isLoading, isError, error, refetch } = useTripPlayback(tripId);

  const points = useMemo(() => data?.points ?? [], [data?.points]);
  const range = useMemo(() => playbackRange(points), [points]);

  const [offsetMs, setOffsetMs] = useState(range.min);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(4);
  const [scrubbing, setScrubbing] = useState(false);

  // Reset the playhead whenever a different trip's track arrives, so
  // navigating between two trips does not leave the scrubber parked at
  // an offset that means nothing on the new one.
  useEffect(() => {
    setOffsetMs(range.min);
    setPlaying(false);
  }, [range.min, tripId]);

  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }

    const tick = (now: number) => {
      const previous = lastTickRef.current;
      lastTickRef.current = now;

      if (previous !== null) {
        // Driven by the REAL elapsed time between frames, not by a fixed
        // increment per frame: a fixed increment makes playback speed
        // depend on the display's refresh rate, so the same trip runs at
        // different speeds on two machines.
        setOffsetMs((current) => {
          const next = advanceOffset(current, now - previous, speed, range.max);
          if (next.ended) setPlaying(false);
          return next.offsetMs;
        });
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [playing, speed, range.max]);

  const frame = useMemo(() => frameAtOffset(points, offsetMs), [points, offsetMs]);

  const restart = useCallback(() => {
    setOffsetMs(range.min);
    setPlaying(true);
  }, [range.min]);

  const togglePlay = useCallback(() => {
    // Pressing play at the end restarts rather than doing nothing, which
    // is what every video player does and what an operator expects.
    if (!playing && offsetMs >= range.max) {
      restart();
      return;
    }
    setPlaying((p) => !p);
  }, [playing, offsetMs, range.max, restart]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load the route</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>{describeQueryError(error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!data || points.length === 0) {
    const copy = data?.emptyReason ? EMPTY_REASON_COPY[data.emptyReason] : null;
    return (
      <EmptyState
        icon={<MapPinOff className="size-8 text-muted-foreground" aria-hidden="true" />}
        title={copy?.title ?? 'No route to replay'}
        description={
          copy?.description ??
          'This trip has no stored positions, so there is nothing to play back.'
        }
      />
    );
  }

  const elapsed = offsetMs - range.min;
  const total = range.max - range.min;

  return (
    <div className="space-y-3">
      <div className="min-h-80 overflow-hidden rounded-lg border border-border lg:min-h-100">
        <TripPlaybackMap
          points={points}
          frame={frame}
          vehicleType={vehicleType}
          licensePlate={data.licensePlate}
          // Following is suspended while the operator drags: panning the
          // map under a moving thumb makes the scrubber feel broken.
          follow={playing && !scrubbing}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={togglePlay}>
          {playing ? (
            <Pause className="size-3.5" aria-hidden="true" />
          ) : (
            <Play className="size-3.5" aria-hidden="true" />
          )}
          {playing ? 'Pause' : offsetMs >= range.max ? 'Replay' : 'Play'}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPlaying(false);
            setOffsetMs(range.min);
          }}
          aria-label="Back to the start of the trip"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Start
        </Button>

        <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <span>Speed</span>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-body-sm"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value) as PlaybackSpeed)}
          >
            {PLAYBACK_SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}×
              </option>
            ))}
          </select>
        </label>

        <span className="text-body-sm tabular-nums text-muted-foreground">
          {formatElapsed(elapsed)} / {formatElapsed(total)}
        </span>
      </div>

      {/*
        A native range input rather than the shared <Slider>: that wrapper
        renders TWO thumbs unless it is handed an array value (its
        `_values` falls back to `[min, max]`), and a scrubber has one
        playhead. A native range is also keyboard-accessible out of the
        box, which matters for a control an operator drives repeatedly.
      */}
      <input
        type="range"
        className="w-full accent-primary"
        min={range.min}
        max={range.max}
        step={Math.max(1, Math.round(total / 1000))}
        value={offsetMs}
        aria-label="Position within the trip"
        aria-valuetext={`${formatElapsed(elapsed)} of ${formatElapsed(total)}`}
        onPointerDown={() => setScrubbing(true)}
        onPointerUp={() => setScrubbing(false)}
        onChange={(event) => {
          setPlaying(false);
          setOffsetMs(Number(event.target.value));
        }}
      />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Time</dt>
          <dd className="tabular-nums">
            {frame ? formatDate(frame.timestamp, 'MMM dd, yyyy HH:mm:ss') : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Speed</dt>
          {/*
            Blank, not "0 km/h", when the reading did not report one --
            see the header.
          */}
          <dd className="tabular-nums">
            {typeof frame?.speed === 'number' ? `${Math.round(frame.speed)} km/h` : 'Not reported'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Heading</dt>
          <dd className="tabular-nums">
            {typeof frame?.heading === 'number' ? `${Math.round(frame.heading)}°` : 'Not reported'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Readings</dt>
          <dd className="tabular-nums">
            {points.length}
            {data.downsampled && (
              <span className="text-muted-foreground"> of {data.sourceReadingCount}</span>
            )}
          </dd>
        </div>
      </dl>

      {data.downsampled && (
        /*
          Stated, never implied. A decimated path drawn as though it were
          complete would make a vehicle appear to cut corners it did not
          cut.
        */
        <Badge variant="outline" className="gap-1">
          Route thinned to {points.length} of {data.sourceReadingCount} readings for display
        </Badge>
      )}
    </div>
  );
}
