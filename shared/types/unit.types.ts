// shared/types/unit.types.ts

import { BaseEntity } from './common.types';

export interface Unit extends BaseEntity {
  unit_id: string;
  name: string;
  symbol: string;
  type: 'distance' | 'volume' | 'currency';
  conversion_factor?: number;
  is_default?: boolean;
}

export interface UnitCreateDTO {
  unit_id: string;
  name: string;
  symbol: string;
  type: 'distance' | 'volume' | 'currency';
  conversion_factor?: number;
  is_default?: boolean;
}

export interface UnitUpdateDTO extends Partial<UnitCreateDTO> {
  _id: string;
}