import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../amplify/data/resource";
import outputs from "../amplify_outputs.json";

// 必須在 generateClient() 之前先設定 Amplify，
// 否則產生的 client 會缺少 models（導致 client.models.X 為 undefined）。
Amplify.configure(outputs);

// 共用的 Amplify Data 用戶端
export const client = generateClient<Schema>();
