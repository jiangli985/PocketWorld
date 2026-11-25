import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { parseAlarmTime } from './clockState';

const ITEM_HEIGHT = 36;
const VISIBLE_ROWS = 5;
const SETTLE_DELAY_MS = 90;
const SPACER_HEIGHT = ((VISIBLE_ROWS - 1) / 2) * ITEM_HEIGHT;

const HOUR_VALUES = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const DURATION_HOUR_VALUES = Array.from({ length: 100 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_VALUES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function DrumColumn({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly string[];
  value: string;
  onChange: (next: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const latestValue = useRef(value);
  latestValue.current = value;
  const listId = useId();

  const index = Math.max(0, values.indexOf(value));

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = index * ITEM_HEIGHT;
    if (Math.abs(scroller.scrollTop - target) > 1) {
      scroller.scrollTop = target;
    }
  }, [index]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    []
  );

  const commitScrollPosition = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const nextIndex = Math.min(
      values.length - 1,
      Math.max(0, Math.round(scroller.scrollTop / ITEM_HEIGHT))
    );
    const next = values[nextIndex];
    if (next !== latestValue.current) onChange(next);
  };

  const handleScroll = () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      commitScrollPosition();
    }, SETTLE_DELAY_MS);
  };

  const selectIndex = (nextIndex: number) => {
    const clamped = Math.min(values.length - 1, Math.max(0, nextIndex));
    if (values[clamped] !== latestValue.current) onChange(values[clamped]);
  };

  return (
    <div className="clock-drum-column">
      <span className="clock-drum-label" aria-hidden="true">
        {label}
      </span>
      <div className="clock-drum-window">
        <div className="clock-drum-highlight" aria-hidden="true" />
        <div
          ref={scrollerRef}
          className="clock-drum-scroller"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${index}`}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={event => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              selectIndex(index - 1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              event.stopPropagation();
              selectIndex(index + 1);
            }
          }}
        >
          <div style={{ height: SPACER_HEIGHT }} aria-hidden="true" />
          {values.map((option, optionIndex) => (
            <button
              key={option}
              id={`${listId}-${optionIndex}`}
              type="button"
              role="option"
              aria-selected={optionIndex === index}
              tabIndex={-1}
              className="clock-drum-item"
              onClick={() => selectIndex(optionIndex)}
            >
              {option}
            </button>
          ))}
          <div style={{ height: SPACER_HEIGHT }} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function ClockTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { hours, minutes } = parseAlarmTime(value);
  const hourText = String(hours).padStart(2, '0');
  const minuteText = String(minutes).padStart(2, '0');
  const latest = useRef({ hourText, minuteText });
  latest.current = { hourText, minuteText };

  return (
    <div className="clock-drum" role="group" aria-label="滚动选择闹钟时间">
      <DrumColumn
        label="小时"
        values={HOUR_VALUES}
        value={hourText}
        onChange={nextHour => onChange(`${nextHour}:${latest.current.minuteText}`)}
      />
      <span className="clock-drum-colon" aria-hidden="true">
        :
      </span>
      <DrumColumn
        label="分钟"
        values={MINUTE_VALUES}
        value={minuteText}
        onChange={nextMinute => onChange(`${latest.current.hourText}:${nextMinute}`)}
      />
    </div>
  );
}

export function ClockDurationPicker({
  seconds,
  onChange,
}: {
  seconds: number;
  onChange: (totalSeconds: number) => void;
}) {
  const total = Math.max(
    0,
    Math.min(99 * 3600 + 3599, Math.round(Number.isFinite(seconds) ? seconds : 0))
  );
  const hourText = String(Math.floor(total / 3600)).padStart(2, '0');
  const minuteText = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const secondText = String(total % 60).padStart(2, '0');
  const latest = useRef({ hourText, minuteText, secondText });
  latest.current = { hourText, minuteText, secondText };

  const commit = (hour: string, minute: string, second: string) =>
    onChange(Number(hour) * 3600 + Number(minute) * 60 + Number(second));

  return (
    <div className="clock-drum clock-drum--duration" role="group" aria-label="滚动选择倒计时时长">
      <DrumColumn
        label="小时"
        values={DURATION_HOUR_VALUES}
        value={hourText}
        onChange={nextHour => commit(nextHour, latest.current.minuteText, latest.current.secondText)}
      />
      <span className="clock-drum-colon" aria-hidden="true">
        :
      </span>
      <DrumColumn
        label="分钟"
        values={MINUTE_VALUES}
        value={minuteText}
        onChange={nextMinute => commit(latest.current.hourText, nextMinute, latest.current.secondText)}
      />
      <span className="clock-drum-colon" aria-hidden="true">
        :
      </span>
      <DrumColumn
        label="秒"
        values={MINUTE_VALUES}
        value={secondText}
        onChange={nextSecond => commit(latest.current.hourText, latest.current.minuteText, nextSecond)}
      />
    </div>
  );
}
