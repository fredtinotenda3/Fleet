// components/ui/GlobalLoading.tsx

'use client';

import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

export function GlobalLoading() {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const isLoading = isFetching > 0 || isMutating > 0;
  
  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          className="fixed top-0 left-0 right-0 z-50"
        >
          <div className="h-1 bg-primary">
            <motion.div
              className="h-full bg-primary-foreground"
              initial={{ width: '0%' }}
              animate={{ width: ['0%', '50%', '100%'] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}