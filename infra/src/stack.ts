import { Construct, Stack } from 'monocdk';

export class BookingValleyStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      env: {
        account: '134442654950',
        region: 'us-west-2',
      },
    });
  }
}
