import { Construct, RemovalPolicy, Duration } from 'monocdk';
import {
  InstanceType,
  InstanceClass,
  InstanceSize,
  SubnetType,
  Port,
} from 'monocdk/aws-ec2';
import {
  DatabaseInstanceEngine,
  DatabaseInstance,
  MysqlEngineVersion,
  StorageType,
  Credentials,
} from 'monocdk/aws-rds';
import { BookingValleyVPCStack } from './vpc';
import { BookingValleyStack } from './stack';
import { Secret } from 'monocdk/lib/aws-secretsmanager';

export class BookingValleyRDSStack extends BookingValleyStack {
  readonly adminSecret: Secret;
  readonly instance: DatabaseInstance;

  constructor(scope: Construct, vpcStack: BookingValleyVPCStack) {
    super(scope, 'BookingValleyRDS');

    // generate admin secret; need to have username and password attributes
    this.adminSecret = new Secret(this, 'BookingValleyRDSSecret', {
      secretName: 'booking-valley-rds-secret',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
      },
    });

    this.instance = new DatabaseInstance(this, 'DBInstance', {
      databaseName: 'BookingValleyDB',
      instanceIdentifier: 'booking-valley',
      engine: DatabaseInstanceEngine.mysql({
        version: MysqlEngineVersion.VER_8_0_21,
      }),

      // admin credentials
      credentials: Credentials.fromSecret(this.adminSecret),

      // Create db cluster in vpc PUBLIC subnet with specified security group
      // to avoid the cost of NAT; and no encryption.
      vpc: vpcStack.vpc,
      publiclyAccessible: true,
      securityGroups: [vpcStack.dbSG],
      vpcSubnets: vpcStack.vpc.selectSubnets({
        subnetType: SubnetType.PUBLIC,
      }),

      // Use db.t2.micro free tier
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),

      // use a single AZ and 20GB General Purpose 2 storage for free tier
      multiAz: false,
      storageType: StorageType.GP2,
      allocatedStorage: 20,
      maxAllocatedStorage: 21, // must be greater than the above one :)

      // use mysql default listening port
      port: 3306,

      // turn off backups
      backupRetention: Duration.days(0),

      // just delete without any backup snapshot to save cost
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // allow public access to RDS mysql instance
    this.instance.connections.allowFromAnyIpv4(Port.tcp(3306));
  }
}
