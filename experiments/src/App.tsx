import { LazyMotion, MotionConfig } from 'motion/react';
import { AppShell } from './components/layout/AppShell';

// Motion's animation/drag features load after first paint instead of in the main bundle.
const loadMotionFeatures = () => import('./motionFeatures').then((module) => module.default);

export default function App() {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <AppShell />
      </MotionConfig>
    </LazyMotion>
  );
}
