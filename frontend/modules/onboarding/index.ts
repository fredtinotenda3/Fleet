// frontend/modules/onboarding/index.ts

export { GetStartedPanel } from './components/GetStartedPanel';
export { useSetupProgress } from './hooks/useSetupProgress';
export { useOnboardingStore } from './store/onboarding.store';
export {
  buildSetupChecklist,
  summariseSetup,
  EMPTY_SETUP_FACTS,
  type SetupStep,
  type SetupStepId,
  type SetupFacts,
  type SetupProgress,
} from './utils/setup-checklist';
export { buildOrientation, describeWorkspace, type OrientationLink } from './utils/role-orientation';
