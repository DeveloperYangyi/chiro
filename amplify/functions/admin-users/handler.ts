import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  ListUsersCommand,
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  type UserType,
  type AttributeType,
  type GroupType,
} from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;

type Event = {
  arguments: {
    action: string;
    email?: string;
    displayName?: string;
    tempPassword?: string;
    group?: string;
  };
};

export const handler = async (event: Event) => {
  const { action, email, displayName, tempPassword, group } = event.arguments;

  switch (action) {
    case "list": {
      const res = await cognito.send(
        new ListUsersCommand({ UserPoolId: USER_POOL_ID, Limit: 60 })
      );
      const users = await Promise.all(
        (res.Users ?? []).map(async (u: UserType) => {
          const emailAttr = u.Attributes?.find(
            (a: AttributeType) => a.Name === "email"
          );
          const nameAttr = u.Attributes?.find(
            (a: AttributeType) => a.Name === "preferred_username"
          );
          const groupRes = await cognito.send(
            new AdminListGroupsForUserCommand({
              UserPoolId: USER_POOL_ID,
              Username: u.Username!,
            })
          );
          return {
            username: u.Username,
            email: emailAttr?.Value ?? "",
            displayName: nameAttr?.Value ?? "",
            status: u.UserStatus,
            enabled: u.Enabled,
            groups: (groupRes.Groups ?? []).map((g: GroupType) => g.GroupName),
            createdAt: u.UserCreateDate?.toISOString(),
          };
        })
      );
      return JSON.stringify({ users });
    }

    case "create": {
      if (!email) throw new Error("缺少 email");
      const res = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            ...(displayName ? [{ Name: "preferred_username", Value: displayName }] : []),
          ],
          TemporaryPassword: tempPassword || undefined,
        })
      );
      if (group) {
        await cognito.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            GroupName: group,
          })
        );
      }
      return JSON.stringify({
        username: res.User?.Username,
        email,
        status: res.User?.UserStatus,
      });
    }

    case "delete": {
      if (!email) throw new Error("缺少 email");
      await cognito.send(
        new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
        })
      );
      return JSON.stringify({ deleted: email });
    }

    case "addToGroup": {
      if (!email || !group) throw new Error("缺少 email 或 group");
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          GroupName: group,
        })
      );
      return JSON.stringify({ email, group });
    }

    default:
      throw new Error(`未知操作：${action}`);
  }
};
