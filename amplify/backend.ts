import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { placeOrder } from './functions/place-order/resource';
import { adminUsers } from './functions/admin-users/resource';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';

const backend = defineBackend({
  auth,
  data,
  placeOrder,
  adminUsers,
});

// Grant adminUsers Lambda permission to manage Cognito users
const userPoolId = backend.auth.resources.userPool.userPoolId;
const adminFn = backend.adminUsers.resources.lambda as Function;

adminFn.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:ListUsers",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminListGroupsForUser",
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);

// Pass User Pool ID to the Lambda as env var
adminFn.addEnvironment("USER_POOL_ID", userPoolId);
