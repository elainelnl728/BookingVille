import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { DBManager } from './lib/DBManager';
import {
  QueryRequest,
  QueryReservationRequest,
  MakeReservationRequest,
  Response,
  Condition,
  ConditionGroup,
  InsertRequest,
  CancelReservationRequest,
  UpdateRequest,
  Reservation,
} from './Model';

const rdsDBName = process.env.RDS_DB_NAME || '';
const rdsEndpoint = process.env.RDS_ENDPOINT || '';
const rdsPort = parseInt(process.env.RDS_PORT || '3306');

// create the connection pool to connect to RDS
const CONN_POOL = createPool({
  host: rdsEndpoint,
  port: rdsPort,
  database: rdsDBName,
  user: 'admin',
  password: 'j3wg_TXG;,laqdV.m8?;fP-vij7qrFAa', // hardcode for now
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const authorizer = event.requestContext.authorizer;

  if (!authorizer || !authorizer.claims.sub) {
    return serverError('Customer is not authenticated.');
  }

  // use the Cognito userId (sub) as our customerId
  const customerId = authorizer.claims.sub;

  // fetch the path from the request event
  const path = event.path.split('/');

  switch (path[1].toLowerCase()) {
    case 'make-reservation': {
      const revRequest = JSON.parse(
        event.body || '{}'
      ) as MakeReservationRequest;
      return makeReservation(CONN_POOL, revRequest, customerId);
    }

    case 'query-reservation': {
      const queryRequest = JSON.parse(
        event.body || '{}'
      ) as QueryReservationRequest;
      return queryReservation(CONN_POOL, queryRequest, customerId);
    }

    case 'cancel-reservation': {
      const cancelRequest = JSON.parse(
        event.body || '{}'
      ) as CancelReservationRequest;
      return cancelReservation(CONN_POOL, cancelRequest, customerId);
    }

    case 'query':
    default:
      const queryRequest = JSON.parse(event.body || '{}') as QueryRequest;
      return genericQuery(CONN_POOL, queryRequest);
  }
};

/**
 * Generic database query.
 */
export async function genericQuery(connPool: Pool, queryRequest: QueryRequest) {
  if (queryRequest.tables.length == 0) {
    return clientError('QueryRequest.tables must not be empty.');
  }

  try {
    const conn = await connPool.getConnection();
    const [rows] = await DBManager.query(conn, queryRequest);

    conn.release();
    return succeeded(rows);
  } catch (e) {
    return serverError(e);
  }
}

/**
 * Reserve rooms in a transaction.
 */
export async function queryReservation(
  connPool: Pool,
  revRequest: QueryReservationRequest,
  customerId: string
): Promise<Response> {
  if (
    (revRequest.checkInDate && !revRequest.checkOutDate) ||
    (!revRequest.checkInDate && revRequest.checkOutDate)
  ) {
    return clientError(
      'Invalid reservation query: checkin and checkout dates must be both presented.'
    );
  }

  if (
    revRequest.checkInDate &&
    revRequest.checkOutDate &&
    revRequest.checkOutDate <= revRequest.checkInDate
  ) {
    return clientError(
      'Invalid reservation request: checkout date must be greater than the checkin date.'
    );
  }

  let hotelConditions: Condition[] = [];
  let dateConditions: ConditionGroup[] = [];

  hotelConditions.push({
    asso: 'AND',
    op: '=',
    left: 'RESERVATIONS.customerId',
    right: `'${customerId}'`,
  });

  hotelConditions.push({
    asso: 'AND',
    op: '=',
    left: 'ROOMS.roomId',
    right: 'RESERVATIONS.roomId',
  });

  // filter out the cancelled records if `encludeCancelled` is not true
  if (!revRequest.encludeCancelled) {
    hotelConditions.push({
      asso: 'AND',
      op: 'is',
      left: 'RESERVATIONS.cancelledTime',
      right: null,
    });
  }

  if (revRequest.hotelName) {
    hotelConditions.push({
      asso: 'AND',
      op: '=',
      left: 'ROOMS.hotelName',
      right: `'${revRequest.hotelName}'`,
    });
  }

  if (revRequest.roomType) {
    hotelConditions.push({
      asso: 'AND',
      op: 'like',
      left: 'ROOMS.roomType',
      right: `'%${revRequest.roomType}%'`,
    });
  }

  if (revRequest.checkInDate && revRequest.checkOutDate) {
    const checkInDateRange: ConditionGroup = {
      asso: 'OR',
      cond: [
        {
          asso: 'AND',
          op: '>=',
          left: 'RESERVATIONS.checkInDate',
          right: DBManager.toDateString(revRequest.checkInDate),
        },
        {
          asso: 'AND',
          op: '<',
          left: 'RESERVATIONS.checkInDate',
          right: DBManager.toDateString(revRequest.checkOutDate),
        },
      ],
    };

    const checkOutDateRange: ConditionGroup = {
      asso: 'OR',
      cond: [
        {
          asso: 'AND',
          op: '>',
          left: 'RESERVATIONS.checkOutDate',
          right: DBManager.toDateString(revRequest.checkInDate),
        },
        {
          asso: 'AND',
          op: '<=',
          left: 'RESERVATIONS.checkOutDate',
          right: DBManager.toDateString(revRequest.checkOutDate),
        },
      ],
    };

    dateConditions = [checkInDateRange, checkOutDateRange];
  }

  // query all the reservations of the requested hotel room type within the check-in and out dates
  const queryRequest = {
    tables: ['ROOMS', 'RESERVATIONS'],
    conditions: {
      asso: 'AND',
      cond:
        dateConditions.length === 0
          ? [{ asso: 'AND', cond: hotelConditions }]
          : [
              { asso: 'AND', cond: hotelConditions },
              { asso: 'AND', cond: dateConditions },
            ],
    },
  } as QueryRequest;

  try {
    const conn = await connPool.getConnection();
    const [rows] = await DBManager.query(conn, queryRequest);

    conn.release();
    return succeeded(groupReservationsPerOrder(rows as RowDataPacket[]));
  } catch (e) {
    return serverError(e);
  }
}

/**
 * Reserve rooms in a transaction.
 */
export async function makeReservation(
  connPool: Pool,
  revRequest: MakeReservationRequest,
  customerId: string
): Promise<Response> {
  if (!revRequest.checkOutDate || !revRequest.checkInDate) {
    return clientError(
      'Invalid reservation: both checkin and checkout dates must be presented.'
    );
  }

  if (revRequest.checkOutDate <= revRequest.checkInDate) {
    return clientError(
      'Invalid reservation: checkout date must be greater than the checkin date.'
    );
  }

  // query hotel room information
  const roomInfoQueryRequest: QueryRequest = {
    tables: ['ROOMS'],
    conditions: {
      asso: 'AND',
      cond: [
        {
          asso: 'AND',
          op: '=',
          left: 'hotelName',
          right: `'${revRequest.hotelName}'`,
        },
        {
          asso: 'AND',
          op: '=',
          left: 'roomType',
          right: `'${revRequest.roomType}'`,
        },
      ],
    },
  };

  const hotelConditions: Condition[] = [
    {
      asso: 'AND',
      op: '=',
      left: 'ROOMS.roomId',
      right: 'RESERVATIONS.roomId',
    },
    {
      asso: 'AND',
      op: '=',
      left: 'ROOMS.hotelName',
      right: `'${revRequest.hotelName}'`,
    },
    {
      asso: 'AND',
      op: '=',
      left: 'ROOMS.roomType',
      right: `'${revRequest.roomType}'`,
    },
  ];

  const dateRangeConditions: ConditionGroup[] = [
    {
      asso: 'NOT',
      cond: [
        {
          asso: 'AND',
          op: '>=',
          left: 'RESERVATIONS.checkInDate',
          right: DBManager.toDateString(revRequest.checkOutDate),
        },
        {
          asso: 'OR',
          op: '<=',
          left: 'RESERVATIONS.checkOutDate',
          right: DBManager.toDateString(revRequest.checkInDate),
        },
      ],
    },
  ];

  // query all the reservations of the requested hotel room type
  // within the check-in and out dates
  const queryReservationRequest = {
    tables: ['ROOMS', 'RESERVATIONS'],
    conditions: {
      asso: 'AND',
      cond: [
        { asso: 'AND', cond: hotelConditions },
        { asso: 'AND', cond: dateRangeConditions },
      ],
    } as ConditionGroup,
  } as QueryRequest;

  console.warn(
    'queryReservationRequest: ',
    JSON.stringify(queryReservationRequest)
  );

  const conn = await connPool.getConnection();

  console.log('succesfully got conn');
  await conn.beginTransaction();
  console.log('transaction begins');

  try {
    const [roomInfo, reservedInfo] = await Promise.all([
      DBManager.query(conn, roomInfoQueryRequest),
      DBManager.query(conn, queryReservationRequest),
    ]);

    const roomRecords = (roomInfo as RowDataPacket[])[0];
    const reservedRecords = (reservedInfo as RowDataPacket[])[0];

    // check if no enough room to reserve
    if (roomRecords.length - reservedRecords.length < revRequest.reserveCount) {
      await conn.rollback();
      conn.release();

      return clientError('No enough room(s) to reserve.');
    }

    // pick up the available rooms to reserve
    const availRooms = roomRecords.filter(
      (room: any) =>
        !reservedRecords.some(
          (reserved: any) => (reserved as any).roomId === (room as any).roomId
        )
    );

    const revQueries: InsertRequest[] = [];
    const currentTime = new Date();

    // insert the reservation records
    for (let i = 0; i < revRequest.reserveCount; ++i) {
      const revQuery: InsertRequest = {
        table: 'RESERVATIONS',
        values: {
          reservationId: uuid(),
          customerId: customerId,
          roomId: (availRooms[i] as any).roomId,
          checkInDate: DBManager.toDateString(revRequest.checkInDate),
          checkOutDate: DBManager.toDateString(revRequest.checkOutDate),
          reservedTime: DBManager.toDateTimeString(currentTime),
        },
      };

      revQueries.push(revQuery);
    }

    // insert all reservations to DB; wait for all finish
    await Promise.all(revQueries.map((q) => DBManager.insert(conn, q)));
  } catch (e) {
    console.warn('Invalid reservation query', e);
    await conn.rollback();
    conn.release();

    return serverError(e);
  }

  // commit transaction at the end
  try {
    await conn.commit();
    conn.release();
  } catch (e) {
    console.warn('Failed to commit make reservation transaction ', e);
    conn.release();
    return serverError(e);
  }

  // return 200 http status code and empty JSON block when succeeded
  return succeeded({});
}

/**
 * Cancel the reservations of a list of rooms in a transaction.
 */
export async function cancelReservation(
  connPool: Pool,
  cancelRequest: CancelReservationRequest,
  customerId: string
): Promise<Response> {
  // use current timestamp as the cancelled time
  const currentTime = new Date();

  const cancelQueries: UpdateRequest[] = [];

  // update the reservation records to make them as cancelled
  for (const reservationId of cancelRequest.reservationIds) {
    const reservationConditions: ConditionGroup = {
      asso: 'AND',
      cond: [
        {
          asso: 'AND',
          op: '=',
          left: 'reservationId',
          right: `'${reservationId}'`,
        },
        {
          // make sure only current customerId can cancel the reservation
          asso: 'AND',
          op: '=',
          left: 'customerId',
          right: `'${customerId}'`,
        },
      ],
    };

    const cancelQuery: UpdateRequest = {
      table: 'RESERVATIONS',
      values: {
        cancelledTime: DBManager.toDateTimeString(currentTime),
      },
      conditions: reservationConditions,
    };

    cancelQueries.push(cancelQuery);
  }

  const conn = await connPool.getConnection();
  await conn.beginTransaction();

  try {
    // update all reservations to DB; wait for all finish
    await Promise.all(cancelQueries.map((q) => DBManager.update(conn, q)));
  } catch (e) {
    console.warn('Invalid cancel reservation query', e);
    await conn.rollback();
    conn.release();

    return serverError(e);
  }

  // commit transaction at the end
  try {
    await conn.commit();
    conn.release();
  } catch (e) {
    console.warn('Failed to commit cancel reservation transaction ', e);
    conn.release();
    return serverError(e);
  }

  // return 200 http status code and empty JSON block when succeeded
  return succeeded({});
}

/**
 * Group the queried reservation results.
 */
function groupReservationsPerOrder(items: RowDataPacket[]): Reservation[] {
  const revs: Record<string, Reservation> = {};

  for (const item of items) {
    const roomId: string = item.roomId;
    const endIdx = roomId.lastIndexOf('-');
    const roomIdPrefix = roomId.substring(0, endIdx);
    const groupByKey = `${roomIdPrefix}:${item.reservedTime}:${item.cancelledTime}`;

    if (revs[groupByKey]) {
      revs[groupByKey].reservationIds.push(item.reservationId);
    } else {
      revs[groupByKey] = {
        roomIdPrefix,
        reservationIds: [item.reservationId],
        hotelName: item.hotelName,
        checkInDate: item.checkInDate,
        checkOutDate: item.checkOutDate,
        cancelledTime: item.cancelledTime ? item.cancelledTime : null,
      } as Reservation;
    }
  }

  return Object.values(revs);
}

function clientError(message: string) {
  return {
    statusCode: 400,
    headers: {
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    },
    body: JSON.stringify({ error: message }),
  };
}

function serverError(e: any) {
  return {
    statusCode: 500,
    headers: {
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    },
    body: JSON.stringify({ error: e }),
  };
}

function succeeded(response: any) {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
    },
    body: JSON.stringify(response),
  };
}
