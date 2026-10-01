// frontend/modules/onboarding/index.ts

export { GetStartedPanel } from './components/GetStartedPanel';
export { SetupCentrePage } from './components/SetupCentrePage';
export { useSetupProgress } from './hooks/useSetupProgress';
export { useFleetProfileMutations } from './hooks/useFleetProfileMutations';
export { useOnboardingStore } from './store/onboarding.store';
export {
  buildSetupChecklist,
  summariseSetup,
  shouldShowSetupChecklist,
  EMPTY_SETUP_FACTS,
  type SetupStep,
  type SetupStepId,
  type SetupFacts,
  type SetupProgress,
} from './utils/setup-checklist';
export { buildOrientation, describeWorkspace, type OrientationLink } from './utils/role-orientation';
