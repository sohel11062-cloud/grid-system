"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

interface Props {
  text: string;

  speed?: number;

  delay?: number;

  className?: string;

  loop?: boolean;

  scramble?: boolean;

  glow?: boolean;

  cursor?: boolean;

  eraseOnLoop?: boolean;
}

const SCRAMBLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}\\/|!@#$%^&*";

export function TerminalText({
  text,

  speed = 32,

  delay = 0,

  className = "",

  loop = false,

  scramble = true,

  glow = true,

  cursor = true,

  eraseOnLoop = false,
}: Props) {

  const [
    displayed,
    setDisplayed,
  ] = useState("");

  const [
    done,
    setDone,
  ] = useState(false);

  const intervalRef =
    useRef<NodeJS.Timeout | null>(
      null,
    );

  const timeoutRef =
    useRef<NodeJS.Timeout | null>(
      null,
    );

  useEffect(() => {

    let index = 0;

    let mounted = true;

    setDisplayed("");

    setDone(false);

    function randomChar() {

      return SCRAMBLE[
        Math.floor(
          Math.random() *
            SCRAMBLE.length,
        )
      ];
    }

    function buildFrame(
      current: number,
    ) {

      const resolved =
        text.slice(
          0,
          current,
        );

      const remaining =
        text
          .slice(current)
          .split("")
          .map((char) => {

            if (
              char === " "
            ) {
              return " ";
            }

            return scramble
              ? randomChar()
              : "";
          })
          .join("");

      return (
        resolved +
        remaining
      );
    }

    function startTyping() {

      intervalRef.current =
        setInterval(() => {

          if (
            !mounted
          ) {
            return;
          }

          index++;

          if (
            index >=
            text.length
          ) {

            setDisplayed(
              text,
            );

            setDone(true);

            if (
              intervalRef.current
            ) {

              clearInterval(
                intervalRef.current,
              );
            }

            // LOOP

            if (loop) {

              timeoutRef.current =
                setTimeout(
                  () => {

                    if (
                      eraseOnLoop
                    ) {

                      let eraseIndex =
                        text.length;

                      intervalRef.current =
                        setInterval(
                          () => {

                            eraseIndex--;

                            setDisplayed(
                              text.slice(
                                0,
                                eraseIndex,
                              ),
                            );

                            if (
                              eraseIndex <=
                              0
                            ) {

                              if (
                                intervalRef.current
                              ) {

                                clearInterval(
                                  intervalRef.current,
                                );
                              }

                              index = 0;

                              setDone(
                                false,
                              );

                              startTyping();
                            }
                          },
                          18,
                        );

                    } else {

                      index = 0;

                      setDone(
                        false,
                      );

                      startTyping();
                    }
                  },
                  1600,
                );
            }

            return;
          }

          setDisplayed(
            buildFrame(
              index,
            ),
          );

        }, speed);
    }

    timeoutRef.current =
      setTimeout(
        startTyping,
        delay,
      );

    return () => {

      mounted = false;

      if (
        intervalRef.current
      ) {

        clearInterval(
          intervalRef.current,
        );
      }

      if (
        timeoutRef.current
      ) {

        clearTimeout(
          timeoutRef.current,
        );
      }
    };

  }, [
    text,
    speed,
    delay,
    loop,
    scramble,
    eraseOnLoop,
  ]);

  return (
    <span
      className={`
        relative
        inline-flex
        items-center
        ${glow ? "text-shadow-cyan" : ""}
        ${className}
      `}
    >

      <span
        className="
          relative
          whitespace-pre-wrap
        "
      >
        {displayed}
      </span>

      {cursor && (

        <span
          className={`
            ml-[2px]
            inline-block
            h-[0.9em]
            w-[2px]
            bg-current
            align-middle
            ${
              done
                ? "animate-terminalBlink"
                : "animate-pulse"
            }
          `}
          style={{
            boxShadow:
              glow
                ? "0 0 12px currentColor"
                : "none",
          }}
        />
      )}

    </span>
  );
}