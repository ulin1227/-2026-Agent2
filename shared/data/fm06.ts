export type Source = {
  title: string;
  detail: string;
  owner: string;
  date: string;
};

export type Conversation = {
  id: string;
  topic: string;
  user: string;
  status: "safe" | "review" | "blocked";
  confidence: number;
  question: string;
  answer: string;
  recommendation: string;
  sources: Source[];
  claims: {
    text: string;
    verdict: "支持" | "中立" | "矛盾";
  }[];
};

export const knowledgeModes = [
  {
    id: "project-map",
    label: "企劃地圖",
    title: "理解整體架構",
    description: "查看任務、決策、人員與來源文件之間的關係。",
    tone: "系統會優先補足「為什麼這樣設計」的脈絡。",
  },
  {
    id: "roadmap",
    label: "新人路線圖",
    title: "照順序上手",
    description: "依完備度規範，把交接資訊拆成可執行的接手順序。",
    tone: "不用一次看完，照這個順序就好。",
  },
  {
    id: "risks",
    label: "風險管理",
    title: "避開重複踩坑",
    description: "整理過去延期、錯誤、權限與相依性提醒。",
    tone: "提醒來自歷史紀錄，不會取代原始決策。",
  },
] as const;

export const conversations: Conversation[] = [
  {
    id: "FM06-042",
    topic: "Project ORBIT 接手第一步",
    user: "新人測試帳號",
    status: "safe",
    confidence: 86,
    question: "我今天應該先確認哪一段？",
    answer:
      "建議先看業務內容交接中的 UAT 阻塞問題 owner、新版 SSO 測試報告與發票下載測試，再回頭確認人際關係與資產權限是否足以執行下一步。",
    recommendation: "先完成 B2 接手行動、P2 聯絡時機、A2 取得方式三項查核。",
    sources: [
      {
        title: "業務內容交接：進行中專案",
        detail: "Project ORBIT UAT 完成約 78%，下一步是完成 SSO 安全修正及發票下載測試。",
        owner: "林書妍",
        date: "2026-07-22",
      },
      {
        title: "完備性檢查規範：阻斷問題",
        detail: "不知道接手後第一步、近期重要任務沒有處理人或期限，都是阻斷問題。",
        owner: "小組規範",
        date: "2026-07-25",
      },
    ],
    claims: [
      { text: "Project ORBIT 目前處於 UAT。", verdict: "支持" },
      { text: "接手第一步需要知道下一步與近期期限。", verdict: "支持" },
      { text: "確認表已勾選即可取代明細查核。", verdict: "矛盾" },
    ],
  },
  {
    id: "FM06-043",
    topic: "交接文件完備度",
    user: "新人測試帳號",
    status: "safe",
    confidence: 92,
    question: "這份交接文件完備嗎？",
    answer:
      "依小組規範，Project ORBIT 應先分成業務內容、人際關係、公司資產三類，再用 B1-B3、P1-P3、A1-A3 九項檢查。三份 Demo 文件目前都能支撐可執行判定。",
    recommendation: "輸出時需列出每項分數、缺漏、阻斷項與來源位置。",
    sources: [
      {
        title: "完備性檢查規範：九項檢查",
        detail: "業務內容檢查 B1-B3，人際關係檢查 P1-P3，公司資產檢查 A1-A3。",
        owner: "小組規範",
        date: "2026-07-25",
      },
      {
        title: "完備性檢查規範：狀態門檻",
        detail: "complete 需達 80 分以上、無阻斷項且所有 P0 欄位至少 actionable。",
        owner: "小組規範",
        date: "2026-07-25",
      },
    ],
    claims: [
      { text: "完備性檢查需分成三類九項。", verdict: "支持" },
      { text: "每個結論都需附來源位置。", verdict: "支持" },
    ],
  },
  {
    id: "FM06-044",
    topic: "資安與權限問題",
    user: "新人測試帳號",
    status: "blocked",
    confidence: 38,
    question: "交接文件裡可以直接留下系統密碼嗎？",
    answer:
      "不可以。公司資產交接文件明確規定不記錄明碼密碼，接手者需以自己的公司帳號申請權限。",
    recommendation: "未通過敏感資訊 Guardrail，不輸出密碼、token、API key 或機密憑證。",
    sources: [
      {
        title: "公司資產交接：安全規則",
        detail: "交接文件不記錄明碼密碼；接手者應以自己的公司帳號申請權限。",
        owner: "林書妍",
        date: "2026-07-22",
      },
    ],
    claims: [
      { text: "交接文件不得記錄明碼密碼。", verdict: "支持" },
      { text: "可以把密碼交給接手者直接使用。", verdict: "矛盾" },
    ],
  },
];

export type ProjectMapNode = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  status: "safe" | "review" | "blocked";
  prompt: string;
  sources: string[];
};

export type ProjectMapBranch = {
  id: "tasks" | "decisions" | "people" | "assets";
  eyebrow: string;
  title: string;
  summary: string;
  nodes: ProjectMapNode[];
};

export const projectMapBranches: ProjectMapBranch[] = [
  {
    id: "tasks",
    eyebrow: "01｜TASKS",
    title: "任務現況",
    summary: "Project ORBIT 目前處於 UAT，下一步集中在 SSO 與發票下載測試。",
    nodes: [
      {
        id: "uat-owner",
        title: "UAT 阻塞 owner",
        summary: "8/18 前需逐項確認阻塞問題負責人。",
        detail: "工程修正找陳柏維，SSO 或測試帳號問題找郭芷晴；不可由 Agent 自行指定 owner。",
        status: "review",
        prompt: "請幫我整理 UAT 阻塞問題要找誰，以及下一步怎麼做。",
        sources: ["業務內容交接：待辦事項", "人際關係交接：團隊成員"],
      },
      {
        id: "sso-report",
        title: "新版 SSO 測試報告",
        summary: "8/21 前等待安域科技交付新版測試報告。",
        detail: "報告交付後需由郭芷晴或資安確認，不應由新人自行判定安全通過。",
        status: "review",
        prompt: "新版 SSO 測試報告目前要怎麼追？需要找誰確認？",
        sources: ["業務內容交接：待辦事項", "人際關係交接：外部聯絡人"],
      },
      {
        id: "invoice-test",
        title: "發票下載測試",
        summary: "8/16 前完成批次發票下載壓力測試。",
        detail: "測試時必須逐筆確認公司別，避免跨公司資料出現在下載結果中。",
        status: "safe",
        prompt: "請列出發票下載測試的檢查步驟與風險提醒。",
        sources: ["業務內容交接：背景與風險", "業務內容交接：待辦事項"],
      },
    ],
  },
  {
    id: "decisions",
    eyebrow: "02｜DECISIONS",
    title: "決策脈絡",
    summary: "上線時程、功能範圍與資料安全是目前主要決策依據。",
    nodes: [
      {
        id: "launch-date",
        title: "上線日調整",
        summary: "預計上線日由 9/22 調整至 10/06。",
        detail: "調整原因包含 SSO 安全測試與發票資料錯配風險。",
        status: "safe",
        prompt: "為什麼 Project ORBIT 上線日調整到 10/06？請附來源。",
        sources: ["業務內容交接：工作概述", "業務內容交接：背景與風險"],
      },
      {
        id: "payment-scope",
        title: "第一階段範圍",
        summary: "第一階段不包含線上付款。",
        detail: "若客戶或內部詢問付款功能，需回到既有範圍與決策紀錄確認。",
        status: "safe",
        prompt: "Project ORBIT 第一階段範圍包含哪些？不包含什麼？",
        sources: ["業務內容交接：背景與風險"],
      },
    ],
  },
  {
    id: "people",
    eyebrow: "03｜PEOPLE",
    title: "人員與權責",
    summary: "依情境找窗口，重大資源與客戶承諾由許雅婷決策。",
    nodes: [
      {
        id: "sponsor",
        title: "許雅婷",
        summary: "專案贊助、上線日期與重大資源決策。",
        detail: "核心功能無法使用、資料可能錯配或客戶承諾改變時需升級。",
        status: "safe",
        prompt: "什麼情況要升級給許雅婷？請整理判斷規則。",
        sources: ["人際關係交接：團隊成員", "人際關係交接：固定溝通與升級"],
      },
      {
        id: "engineering-security",
        title: "陳柏維 / 郭芷晴",
        summary: "陳柏維處理工程修正；郭芷晴處理 SSO、安全與測試帳號。",
        detail: "UAT 阻塞需先判斷屬於工程功能、SSO 安全或測試帳號問題。",
        status: "safe",
        prompt: "UAT 問題要怎麼分給陳柏維或郭芷晴？",
        sources: ["人際關係交接：團隊成員", "人際關係交接：固定溝通與升級"],
      },
    ],
  },
  {
    id: "assets",
    eyebrow: "04｜ASSETS",
    title: "來源文件與資產",
    summary: "文件庫、工單、UAT、BI 與客服知識庫是接手必要資源。",
    nodes: [
      {
        id: "kb-orbit",
        title: "KB-ORBIT 文件庫",
        summary: "專案總覽、需求、UAT 與決策紀錄都在 KB-ORBIT。",
        detail: "接手者需加入 ORBIT-Core 群組，不能使用他人帳號或密碼。",
        status: "safe",
        prompt: "Project ORBIT 的文件位置在哪？如果打不開要確認什麼？",
        sources: ["公司資產交接：重要文件位置", "公司資產交接：安全規則"],
      },
      {
        id: "bi-042",
        title: "BI-042 儀表板",
        summary: "查看使用率及問題數據，權限預計 8/8 完成。",
        detail: "目前屬於待處理資產，但已有日期、狀態與完成標準，所以不是阻斷項。",
        status: "review",
        prompt: "BI-042 權限目前狀態是什麼？會不會阻擋交接？",
        sources: ["公司資產交接：系統與權限", "公司資產交接：尚待完成的移交"],
      },
    ],
  },
];

export const roadmapItems = [
  {
    label: "核對交接文件",
    state: "done",
    owner: "離職同事",
    detail: "三份 Project ORBIT Demo 文件與完備性規範已載入。",
    prompt: "請確認目前交接文件是否完整，並列出九項分數。",
  },
  {
    label: "建立 RAG 知識庫",
    state: "active",
    owner: "Agent",
    detail: "回答會以交接文件片段與 guardrail 檢查支撐。",
    prompt: "目前 RAG 與來源檢查是怎麼支撐回答的？",
  },
  {
    label: "查看企劃地圖",
    state: "next",
    owner: "新人",
    detail: "先理解任務、決策、人員、文件資產之間的關係。",
    prompt: "請用企劃地圖的角度帶我理解 Project ORBIT。",
  },
  {
    label: "完成第一輪風險檢查",
    state: "next",
    owner: "新人",
    detail: "優先看 SSO、發票下載、BI-042 權限與敏感資訊規則。",
    prompt: "請幫我完成第一輪 Project ORBIT 風險檢查。",
  },
];

export const riskCards = [
  {
    id: "sso",
    title: "SSO 安全測試未完成",
    impact: "可能影響上線判斷。",
    owner: "郭芷晴 / 安域科技何俊叡",
    status: "review",
    prompt: "SSO 安全測試未完成時，我下一步要怎麼追？",
  },
  {
    id: "invoice",
    title: "發票資料錯配",
    impact: "下載結果不得出現跨公司資料。",
    owner: "陳柏維 / 李沛蓉",
    status: "blocked",
    prompt: "發票下載如果出現公司別錯配，要怎麼處理與升級？",
  },
  {
    id: "bi",
    title: "BI-042 權限待完成",
    impact: "會影響接手者查看使用率與問題數據。",
    owner: "資料團隊",
    status: "review",
    prompt: "BI-042 權限待完成，交接上要補哪些資訊？",
  },
] as const;
