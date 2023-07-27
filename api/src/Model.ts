/**
 * SQL Query conditions.
 */
export interface ConditionGroup {
  asso: 'AND' | 'OR' | 'NOT';
  cond: ConditionGroup[] | Condition[];
}

export interface Condition {
  asso: 'AND' | 'OR';
  op: '=' | '>' | '<' | '>=' | '<=' | '<>' | 'like' | 'is' | 'is not';
  left: string;
  right: string | null;
}

/**
 * SQL Query orderBy field.
 */
export interface OrderBy {
  attr: string;
  asc?: boolean;
}

/**
 * API response.
 */
export interface Response {
  statusCode: number;
  body: string;
}

/**
 * Generic SQL Query request.
 */
export interface QueryRequest {
  tables: string[];
  conditions?: ConditionGroup;
  orderBy?: OrderBy[];
  limit?: number;
}

/**
 * Insert Into request.
 */
export interface InsertRequest {
  table: string;
  values: Record<string, string | number | null>;
}

/**
 * Update request.
 */
export interface UpdateRequest {
  table: string;
  values: Record<string, string | number | null>;
  conditions?: ConditionGroup;
}

/**
 * Query room reservations reqeust.
 */
export interface QueryReservationRequest {
  hotelName?: string;
  roomType?: string;
  checkInDate?: string | Date;
  checkOutDate?: string | Date;
  limit?: number;
  encludeCancelled?: boolean;
}

/**
 * Query room reservations response.
 */
export interface QueryReservationResponse {
  reservations: Reservation[];
}

/**
 * Each record of the queried reservations.
 */
export interface Reservation {
  roomIdPrefix: string;
  reservationIds: string[];
  hotelName: string;
  checkInDate: string | Date;
  checkOutDate: string | Date;
  cancelledTime?: string;
}

/**
 * Make new room reservations request.
 */
export interface MakeReservationRequest {
  hotelName: string;
  roomType: string;
  reserveCount: number;
  checkInDate: string | Date;
  checkOutDate: string | Date;
}

/**
 * Cancel existing reservations request.
 */
export interface CancelReservationRequest {
  reservationIds: string[];
}
