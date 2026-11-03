"use client";

import { FormEvent, useMemo, useState } from "react";

type Screen = "auth" | "role" | "link" | "complete";
type AuthMode = "login" | "register";
type Role = "leaver" | "colleague" | "supervisor" | "newcomer";

const roles: Array<{
  id: Role;
  index: string;
  title: string;
  description: string;
  destination: string;
}> = [
  {
    id: "leaver",
    index: "01",
    title: "我要交接工作",
    description: "整理文件與經驗，建立一份完整的交接包。",
    destination: "離職同事引導",
  },
  {
    id: "colleague",
    index: "02",
    title: "我是現職同事",
    description: "協助補充團隊資料，完善專案知識與脈絡。",
    destination: "資料上傳專區",
  },
  {
    id: "supervisor",
    index: "03",
    title: "我是主管",
    description: "掌握交接進度，檢視缺漏與團隊知識狀態。",
    destination: "交接管理總覽",
  },
  {
    id: "newcomer",
    index: "04",
    title: "我是接手新人",
    description: "使用交接碼連結專案，開始你的上手旅程。",
    destination: "新人功能導向頁",
  },
];

export default function FM01() {
  const [screen, setScreen] = useState<Screen>("role");
  const [mode, setMode] = useState<AuthMode>("login");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [destinationPath, setDestinationPath] = useState<string | null>(null);

  const activeRole = useMemo(
    () => roles.find((role) => role.id === selectedRole),
    [selectedRole],
  );

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setConfirmPassword("");
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (employeeId.trim().length < 3) {
      setError("請輸入有效的員工編號（至少 3 碼）。");
      return;
    }
    if (password.length < 6) {
      setError("密碼至少需要 6 個字元。");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("兩次輸入的密碼不一致。");
      return;
    }

    if (!selectedRole) {
      setError("請返回上一步選擇使用身分。");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId, password, role: selectedRole, remember }),
      });
      const result = (await response.json()) as {
        error?: string;
        destination?: { path?: string | null };
      };
      if (!response.ok) {
        setError(result.error ?? "目前無法完成驗證，請稍後再試。");
        return;
      }

      setDestinationPath(result.destination?.path ?? null);
      setScreen(selectedRole === "newcomer" ? "link" : "complete");
    } catch {
      setError("無法連線至伺服器，請確認網路後再試一次。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueWithRole = () => {
    if (!selectedRole) {
      setError("請先選擇你的身分。");
      return;
    }
    setError("");
    setScreen("auth");
  };

  const submitLinkCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (linkCode.trim().length !== 6) {
      setError("交接碼為 6 碼，請確認後再試一次。");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/handover-cases/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: linkCode }),
      });
      const result = (await response.json()) as {
        error?: string;
        destination?: { path?: string | null };
      };
      if (!response.ok) {
        setError(result.error ?? "無法連結此交接案件。");
        return;
      }
      setDestinationPath(result.destination?.path ?? null);
      setScreen("complete");
    } catch {
      setError("無法連線至伺服器，請確認網路後再試一次。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetFlow = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setScreen("role");
    setEmployeeId("");
    setSelectedRole(null);
    setLinkCode("");
    setPassword("");
    setConfirmPassword("");
    setRemember(false);
    setError("");
    setNotice("");
    setDestinationPath(null);
  };

  const step = screen === "role" ? 1 : screen === "auth" ? 2 : 3;

  return (
    <main className="orchard-app fm01-shell">
      <section className="fm01-story" aria-label="無痛交接產品介紹">
        <header className="fm01-brand">
          <span className="fm01-brand-mark" aria-hidden="true">
            <i />
            <b />
            <em />
          </span>
          <span>
            <strong>無痛交接</strong>
            <small>FLOWLINK</small>
          </span>
        </header>

        <div className="fm01-story-copy">
          <span className="fm01-kicker">INTELLIGENT HANDOVER</span>
          <h1>
            交接不斷線，
            <br />
            經驗不歸零。
          </h1>
          <p>
            讓每一份工作脈絡被好好接住。
            <br />
            從文件、決策到實務經驗，
            <br />
            陪團隊完成一次真正完整的交接。
          </p>
        </div>

        <div className="fm01-orbit" aria-hidden="true">
          <span className="orbit-center">知識</span>
          <span className="orbit-node orbit-node-one">文件</span>
          <span className="orbit-node orbit-node-two">經驗</span>
          <span className="orbit-node orbit-node-three">新人</span>
        </div>

        <footer className="fm01-story-footer">
          <span><i /> 資料安全保存</span>
          <span>企業智能交接系統</span>
        </footer>
      </section>

      <section className="fm01-panel" aria-live="polite">
        <div className="fm01-panel-inner">
          <div className="fm01-progress" aria-label={`目前為第 ${step} 步，共 3 步`}>
            {[1, 2, 3].map((item) => (
              <span key={item} className={item <= step ? "is-active" : ""} />
            ))}
            <small>{step} / 3</small>
          </div>

          {screen === "auth" && (
            <div className="fm01-view auth-view">
              <button type="button" className="back-button" onClick={() => setScreen("role")}>
                ← 返回選擇身分
              </button>
              <div className="fm01-heading">
                <span className="fm01-eyebrow">
                  {activeRole ? `以「${activeRole.title}」繼續` : "歡迎回來"}
                </span>
                <h2>{mode === "login" ? "登入你的帳戶" : "建立新的帳戶"}</h2>
                <p>
                  {mode === "login"
                    ? "繼續你的交接進度，或開始接手新的專案。"
                    : "只需要一分鐘，開始保存團隊的重要經驗。"}
                </p>
              </div>

              <div className="auth-tabs" role="tablist" aria-label="登入或註冊">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  className={mode === "login" ? "is-active" : ""}
                  onClick={() => changeMode("login")}
                >
                  登入
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  className={mode === "register" ? "is-active" : ""}
                  onClick={() => changeMode("register")}
                >
                  註冊
                </button>
              </div>

              <form className="fm01-form" onSubmit={submitAuth} noValidate>
                <label>
                  <span>員工編號</span>
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(event) => setEmployeeId(event.target.value.toUpperCase())}
                    placeholder="例如：A12345"
                    autoComplete="username"
                    aria-describedby={error ? "form-error" : undefined}
                  />
                </label>

                <label>
                  <span>密碼</span>
                  <span className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 6 個字元"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                    >
                      {showPassword ? "隱藏" : "顯示"}
                    </button>
                  </span>
                </label>

                {mode === "register" && (
                  <label>
                    <span>確認密碼</span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="再次輸入密碼"
                      autoComplete="new-password"
                    />
                  </label>
                )}

                {mode === "login" && (
                  <div className="form-options">
                    <label className="remember-field">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                      />
                      <span>記住我</span>
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setNotice("請聯絡系統管理員協助重設密碼。")}
                    >
                      忘記密碼？
                    </button>
                  </div>
                )}

                {error && <p className="form-message is-error" id="form-error">{error}</p>}
                {notice && <p className="form-message">{notice}</p>}

                <button className="fm01-primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "處理中…" : mode === "login" ? "登入並繼續" : "建立帳戶"}
                  <span aria-hidden="true">→</span>
                </button>
              </form>

              <p className="auth-switch">
                {mode === "login" ? "還沒有帳戶？" : "已經有帳戶？"}
                <button
                  type="button"
                  onClick={() => changeMode(mode === "login" ? "register" : "login")}
                >
                  {mode === "login" ? "立即註冊" : "返回登入"}
                </button>
              </p>
            </div>
          )}

          {screen === "role" && (
            <div className="fm01-view role-view">
              <div className="fm01-heading">
                <span className="fm01-eyebrow">選擇使用身分</span>
                <h2>今天想從哪裡開始？</h2>
                <p>先選擇這次要進行的工作，登入後系統會再驗證帳號權限。</p>
              </div>

              <div className="role-list" role="radiogroup" aria-label="選擇使用者角色">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedRole === role.id}
                    className={selectedRole === role.id ? "role-card is-selected" : "role-card"}
                    onClick={() => {
                      setSelectedRole(role.id);
                      setError("");
                    }}
                  >
                    <span className="role-index">{role.index}</span>
                    <span className="role-copy">
                      <strong>{role.title}</strong>
                      <small>{role.description}</small>
                    </span>
                    <span className="role-check" aria-hidden="true">✓</span>
                  </button>
                ))}
              </div>

              {error && <p className="form-message is-error">{error}</p>}
              <button className="fm01-primary" type="button" onClick={continueWithRole}>
                前往登入
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}

          {screen === "link" && (
            <div className="fm01-view link-view">
              <button type="button" className="back-button" onClick={() => setScreen("auth")}>
                ← 返回登入
              </button>
              <div className="link-symbol" aria-hidden="true">
                <span />
                <i />
              </div>
              <div className="fm01-heading is-centered">
                <span className="fm01-eyebrow">連結交接專案</span>
                <h2>輸入你的 6 碼交接碼</h2>
                <p>請向交接同事取得驗證碼，連結後就能查看專案脈絡與新人路線圖。</p>
              </div>

              <form className="link-form" onSubmit={submitLinkCode}>
                <label htmlFor="handover-code">交接碼</label>
                <input
                  id="handover-code"
                  value={linkCode}
                  onChange={(event) =>
                    setLinkCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                  }
                  placeholder="例如：AB12CD"
                  autoComplete="one-time-code"
                  inputMode="text"
                  maxLength={6}
                  autoFocus
                />
                <small>交接碼由交接案件建立者提供</small>
                {error && <p className="form-message is-error">{error}</p>}
                <button className="fm01-primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "驗證中…" : "驗證並連結"}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            </div>
          )}

          {screen === "complete" && (
            <div className="fm01-view complete-view">
              <div className="success-mark" aria-hidden="true">✓</div>
              <div className="fm01-heading is-centered">
                <span className="fm01-eyebrow">設定完成</span>
                <h2>{selectedRole === "newcomer" ? "專案已成功連結" : "身分確認完成"}</h2>
                <p>
                  你將以「{activeRole?.title}」的身分，前往{activeRole?.destination}。
                </p>
              </div>
              <div className="destination-card">
                <span>下一站</span>
                <strong>{activeRole?.destination}</strong>
                <small>
                  {selectedRole === "newcomer"
                    ? "查看企劃地圖、上手路線圖與風險知識"
                    : selectedRole === "supervisor"
                      ? "查看團隊交接進度、待補文件與風險狀態"
                      : "開始整理文件、補足專案脈絡與交接經驗"}
                </small>
              </div>
              <button
                className="fm01-primary"
                type="button"
                onClick={() => {
                  if (destinationPath) {
                    window.location.assign(destinationPath);
                    return;
                  }
                  setNotice("此身分的對應模組尚未完成，登入狀態已安全保存。");
                }}
              >
                進入系統
                <span aria-hidden="true">→</span>
              </button>
              {notice && <p className="form-message">{notice}</p>}
              <button type="button" className="text-button restart-button" onClick={resetFlow}>
                使用其他帳戶重新開始
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
