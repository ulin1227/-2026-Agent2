import type { Metadata } from "next";
import FM01 from "./FM01";

export const metadata: Metadata = {
  title: "登入｜無痛交接 FlowLink",
  description: "無痛交接智能系統入口：登入、註冊與角色確認。",
};

export default function Home() {
  return <FM01 />;
}
