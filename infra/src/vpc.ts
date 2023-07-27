import { Construct } from 'monocdk';
import {
  IVpc,
  Vpc,
  ISecurityGroup,
  SecurityGroup,
  Port,
  Peer,
} from 'monocdk/lib/aws-ec2';
import { BookingValleyStack } from './stack';

export class BookingValleyVPCStack extends BookingValleyStack {
  readonly vpc: IVpc;
  readonly dbSG: ISecurityGroup;

  constructor(scope: Construct) {
    super(scope, 'BookingValleyVPC');

    // create a VPC with public subnets only to save the NAT cost
    this.vpc = Vpc.fromLookup(this, 'DefaultVPC', {
      vpcId: 'vpc-6ca48414',
      isDefault: true,
    });

    // create a security group for RDS DB instance
    this.dbSG = new SecurityGroup(this, 'DBSecurityGroup', {
      securityGroupName: 'DBSecurityGroup',
      vpc: this.vpc,
    });

    this.dbSG.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(3306),
      'Allow public access to mysql 3306 listening port.'
    );

    this.dbSG.addIngressRule(
      Peer.anyIpv4(),
      Port.icmpType(8),
      'Allow ICMP type 8 (Echo) so mysql instance can be discovered by extenral network.'
    );
  }
}
