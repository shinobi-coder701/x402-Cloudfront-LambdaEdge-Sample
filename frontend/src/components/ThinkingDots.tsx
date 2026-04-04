import { motion } from "framer-motion";

export function ThinkingDots() {
  return (
    <div className="thinking-dots">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="dot"
          animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}
