import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { placeOrder } from './functions/place-order/resource';

defineBackend({
  auth,
  data,
  placeOrder,
});
