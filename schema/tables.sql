

DROP DATABASE IF EXISTS `BookingValleyDB`;
CREATE DATABASE IF NOT EXISTS `BookingValleyDB`;
USE `BookingValleyDB`;

/*
	ROOMS table to keep hotel room info.

	Most of the fields, e.g. introductions, pictures, locations are stored
	in NoSQL database; this table just keeps the reservation related info of
	each room.
*/
CREATE TABLE ROOMS(
    roomId          VARCHAR(128)        NOT NULL,
    roomType        VARCHAR(256)        NOT NULL,
    roomNumber      INT                 NOT NULL,
    hotelName       VARCHAR(512)       	NOT NULL,
 
    PRIMARY KEY(roomId)
);

/*
	RESERVATIONS table to store customers' reservations.
*/
CREATE TABLE RESERVATIONS(
    reservationId   VARCHAR(128)        NOT NULL,
    customerId      VARCHAR(128)        NOT NULL,
    roomId          VARCHAR(128)        NOT NULL,
    checkInDate     DATE                NOT NULL,
    checkOutDate    DATE                NOT NULL,
    reservedTime    DATETIME            NOT NULL,
    cancelledTime   DATETIME,
 
    PRIMARY KEY(reservationId)
);

/*
	Add an index to improve the date range query of the RESERVATIONS
*/
CREATE INDEX RESERVATIONS_DATE_RANGE_INDEX USING BTREE
	ON RESERVATIONS (checkInDate, checkOutDate);

