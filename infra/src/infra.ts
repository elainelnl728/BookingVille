#!/usr/bin/env node

import { App } from 'monocdk';
import { BookingValleyRDSStack } from './rds';
import { BookingValleyVPCStack } from './vpc';
import { BookingValleyCognitoStack } from './cognito';
import { BookingValleyAPIStack } from './api';

const app = new App();

// create vpc stack
const vpc = new BookingValleyVPCStack(app);

// create cognito stack
const cognito = new BookingValleyCognitoStack(app);

// create rds stack
const rds = new BookingValleyRDSStack(app, vpc);

// create backend api stack
const api = new BookingValleyAPIStack(app, cognito, rds);

//rds.addDependency(vpc, 'RDS need to be created in VPC.');
//api.addDependency(cognito, 'Backend API depends on Cognito Authorizer');
//api.addDependency(rds, 'Backend API depends on RDS DB');
