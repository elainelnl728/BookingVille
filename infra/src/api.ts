import { Construct, Duration } from 'monocdk';
import { BookingValleyStack } from './stack';
import {
  RestApi,
  LambdaRestApi,
  Deployment,
  EndpointType,
  Cors,
  AuthorizationType,
  IAuthorizer,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
} from 'monocdk/lib/aws-apigateway';
import { Function, Runtime, Code, IFunction } from 'monocdk/lib/aws-lambda';
import { RetentionDays } from 'monocdk/lib/aws-logs';
import { BookingValleyRDSStack } from './rds';
import { PolicyStatement } from 'monocdk/lib/aws-iam';
import { BookingValleyCognitoStack } from './cognito';

export class BookingValleyAPIStack extends BookingValleyStack {
  readonly api: RestApi;
  readonly authorizer: IAuthorizer;
  readonly deplpoyment: Deployment;
  readonly lambda: IFunction;

  constructor(
    scope: Construct,
    cognitoStack: BookingValleyCognitoStack,
    rdsStack: BookingValleyRDSStack
  ) {
    super(scope, 'BookingValleyAPI');

    // Add lambda function of the query endpoint
    this.lambda = new Function(this, 'BookingValleyLambda', {
      functionName: 'BookValleyHandler',
      description: 'BookingValley API lambda function',
      handler: 'BookValleyHandler.handler',
      runtime: Runtime.NODEJS_14_X,

      // Lambda configuration
      code: Code.fromAsset('../api/dist/'),
      timeout: Duration.seconds(3),
      memorySize: 256,
      environment: {
        RDS_ENDPOINT: rdsStack.instance.dbInstanceEndpointAddress,
        RDS_PORT: rdsStack.instance.dbInstanceEndpointPort,
        RDS_DB_NAME: 'BookingValleyDB',
      },
    });

    // allow queryLambda to connect to mysql and exec sql query / transactions
    this.lambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'rds-db:connect',
          'rds-data:ExecuteSql',
          'rds-data:ExecuteStatement',
          'rds-data:BatchExecuteStatement',
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:RollbackTransaction',
        ],
        resources: ['*'],
      })
    );

    // create Cognito Authorizer for API Gateway REST API
    this.authorizer = new CognitoUserPoolsAuthorizer(
      this,
      'BookingValleyCognitoAuthorizer',
      {
        cognitoUserPools: [cognitoStack.userPool],
      }
    );

    // create API Gateway REST instance
    //
    // Note, there's an issue with LambdaRestApi of CDK that it also applied
    // Cognito Authorizer to the root OPTION method. This caused the browsers
    // to get 401 response on CORS preflight.
    //
    // See: https://forums.aws.amazon.com/thread.jspa?threadID=320662
    //
    // As a result, we switch to use RestApi and define each of the resources
    // manaully.
    this.api = new RestApi(this, 'BookingValleyAPI', {
      description: 'BookingValley REST API',
      deployOptions: {
        stageName: 'v1',
      },

      // use REGIONAL type to lower the cost.
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },

      // temporarily allow all CORS.
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: Cors.ALL_METHODS, // this is also the default
      },
    });

    // /query POST API
    const query = this.api.root.addResource('query');
    query.addMethod('POST', new LambdaIntegration(this.lambda), {
      authorizer: this.authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // /query-reservation POST API
    const queryReservation = this.api.root.addResource('query-reservation');
    queryReservation.addMethod('POST', new LambdaIntegration(this.lambda), {
      authorizer: this.authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // /reserve POST API
    const makeReservation = this.api.root.addResource('make-reservation');
    makeReservation.addMethod('POST', new LambdaIntegration(this.lambda), {
      authorizer: this.authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    // /cancel-reservation POST API
    const cancelReservation = this.api.root.addResource('cancel-reservation');
    cancelReservation.addMethod('POST', new LambdaIntegration(this.lambda), {
      authorizer: this.authorizer,
      authorizationType: AuthorizationType.COGNITO,
    });

    this.deplpoyment = new Deployment(this, 'BookingValleyAPIDeployment', {
      api: this.api,
    });
  }
}
