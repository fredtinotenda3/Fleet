// frontend/modules/drivers/components/index.ts
//
// FIX: the module barrel had been saved into this components/ folder by
// mistake (its own header comment read `frontend/modules/drivers/index.ts`),
// so every one of its relative exports resolved one directory too deep and
// the whole drivers module failed to typecheck. Barrel moved up to the
// module root; this file is now the real components barrel.
export * from './DriverSelect';
export * from './DriversTable';
export * from './DriverForm';
export * from './DriverModal';
