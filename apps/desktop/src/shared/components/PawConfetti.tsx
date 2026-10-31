import { motion, useReducedMotion } from "framer-motion";
import { PawIcon } from "./Icons";

interface PawConfettiProps {
  burstKey: number | string;
}

/** One-shot paw-print confetti above the download bar. */
export function PawConfetti({ burstKey }: PawConfettiProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  const pieces = Array.from({ length: 9 }, (_, index) => index);

  return (
    <div className="paw-confetti" aria-hidden="true">
      {pieces.map((index) => (
        <motion.span
          key={`${burstKey}-${index}`}
          className="paw-confetti__piece"
          initial={{ opacity: 0, y: 0, x: 0, rotate: 0, scale: 0.5 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [-8, -140 - (index % 3) * 58],
            x: (index - 4) * 46,
            rotate: index % 2 === 0 ? 42 : -48,
            scale: 1,
          }}
          transition={{ duration: 1.6, delay: index * 0.04, ease: "easeOut" }}
        >
          <PawIcon size={19 + (index % 3) * 5} />
        </motion.span>
      ))}
    </div>
  );
}
