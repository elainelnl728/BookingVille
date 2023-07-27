import { Construct } from 'monocdk';
import { BookingValleyStack } from './stack';
import {
  UserPool,
  IUserPool,
  UserPoolClient,
  IUserPoolClient,
  VerificationEmailStyle,
} from 'monocdk/lib/aws-cognito';

export class BookingValleyCognitoStack extends BookingValleyStack {
  readonly userPool: IUserPool;
  readonly userPoolClient: IUserPoolClient;

  constructor(scope: Construct) {
    super(scope, 'BookingValleyUserPool');

    // create user pool
    this.userPool = new UserPool(this, 'BookingValleyUserPool', {
      userPoolName: 'BookingValleyUserPool',

      // allow users to sign-up themselves
      selfSignUpEnabled: true,

      // only allow to use email address to sign-in
      signInAliases: {
        email: true,
        username: false,
        phone: false,
      },

      // collect the family name and given name
      standardAttributes: {
        familyName: {
          mutable: true,
          required: true,
        },

        givenName: {
          mutable: true,
          required: true,
        },
      },

      // password policy, use simple one to be easier to test
      passwordPolicy: {
        minLength: 6,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },

      // let cognito to send verification emails during account creation
      autoVerify: {
        email: true,
        phone: false,
      },

      // configure the verification email
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
        emailSubject: 'Welcome to BookingValley',
        emailBody: `
<p> Thank you for signing up BookingValley. </p>

<p> Please enter the verification code below to complete the account creation. </p>
<h3>{####}</h3>

<p> Thank you! </p>
<p> - BookingValley team </p>
				`,
      },
    });

    // create user pool client
    this.userPoolClient = new UserPoolClient(this, 'BookingValleyWebClient', {
      userPoolClientName: 'BookingValleyWebClient',
      generateSecret: false,
      userPool: this.userPool,
      oAuth: {
        // only allow Auth Code Grant at this moment
        flows: { authorizationCodeGrant: true, implicitCodeGrant: true },

        // auth callback urls
        callbackUrls: [
          // our website URL
          'https://bookingvalley.netlify.app',

          // for dev test
          'http://localhost:3000',
        ],
      },
    });

    // create an Amazon provided domain
    this.userPool.addDomain('BookingValleyCognitoDomain', {
      cognitoDomain: {
        domainPrefix: 'bookingvalley',
      },
    });
  }
}
