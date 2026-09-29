import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";
import { generateClient } from "aws-amplify/data";

type Operator = Schema["Operator"]["type"];
type TransferReceiver = Schema["TransferReceiver"]["type"];
type Device = Schema["Device"]["type"];

// Separate client for userPool-authenticated mutations
const authClient = generateClient<Schema>({
  authMode: "userPool",
});

const emptyForm = {
  name: "",
  phone: "",
  note: "",
};

interface CognitoUser {
  username: string;
  email: string;
  displayName: string;
  status: string;
  enabled: boolean;
  groups: string[];
  createdAt: string;
}

function UserPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Cognito accounts
  const [cognitoUsers, setCognitoUsers] = useState<CognitoUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  const [receivers, setReceivers] = useState<TransferReceiver[]>([]);
  const [newReceiverName, setNewReceiverName] = useState("");
  const [deviceList, setDeviceList] = useState<Device[]>([]);
  const [newDeviceName, setNewDeviceName] = useState("");

  useEffect(() => {
    const sub = client.models.Operator.observeQuery().subscribe({
      next: (data) => {
        const sorted = [...data.items].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "")
        );
        setOperators(sorted);
      },
    });
    const rSub = client.models.TransferReceiver.observeQuery().subscribe({
      next: (data) => setReceivers([...data.items].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))),
    });
    const devSub = client.models.Device.observeQuery().subscribe({
      next: (data) => setDeviceList([...data.items].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))),
    });
    return () => { sub.unsubscribe(); rSub.unsubscribe(); devSub.unsubscribe(); };
  }, []);

  useEffect(() => {
    loadCognitoUsers();
  }, []);

  async function loadCognitoUsers() {
    setLoadingUsers(true);
    try {
      const { data: result, errors } = await authClient.mutations.adminUsers({
        action: "list",
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
      const parsed = JSON.parse(result as string);
      setCognitoUsers(parsed.users ?? []);
    } catch (err) {
      console.error("載入帳號失敗", err);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function createCognitoUser() {
    if (!newEmail.trim()) {
      alert("請輸入 Email");
      return;
    }
    if (!newDisplayName.trim()) {
      alert("請輸入顯示名稱");
      return;
    }
    setCreating(true);
    try {
      const { errors } = await authClient.mutations.adminUsers({
        action: "create",
        email: newEmail.trim(),
        displayName: newDisplayName.trim(),
        tempPassword: newPassword.trim() || undefined,
        group: newIsAdmin ? "ADMINS" : undefined,
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
      setNewEmail("");
      setNewDisplayName("");
      setNewPassword("");
      setNewIsAdmin(false);
      alert("帳號已建立，臨時密碼將寄送至該 Email");
      await loadCognitoUsers();
    } catch (err) {
      alert(err instanceof Error ? `建立失敗：${err.message}` : "建立帳號失敗");
    } finally {
      setCreating(false);
    }
  }

  async function deleteCognitoUser(email: string) {
    if (!confirm(`確定要刪除帳號 ${email} 嗎？`)) return;
    try {
      const { errors } = await authClient.mutations.adminUsers({
        action: "delete",
        email,
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
      await loadCognitoUsers();
    } catch (err) {
      alert(err instanceof Error ? `刪除失敗：${err.message}` : "刪除帳號失敗");
    }
  }

  async function toggleAdmin(email: string) {
    try {
      const { errors } = await authClient.mutations.adminUsers({
        action: "addToGroup",
        email,
        group: "ADMINS",
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
      await loadCognitoUsers();
    } catch (err) {
      alert(err instanceof Error ? `設定失敗：${err.message}` : "設定管理員失敗");
    }
  }

  // Operator CRUD
  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("請輸入姓名");
      return;
    }
    const payload = {
      name: form.name.trim(),
      role: "ENGINEER" as const,
      phone: form.phone.trim() || null,
      note: form.note.trim() || null,
    };
    if (editingId) {
      await client.models.Operator.update({ id: editingId, ...payload });
    } else {
      await client.models.Operator.create(payload);
    }
    resetForm();
  }

  function handleEdit(o: Operator) {
    setEditingId(o.id);
    setForm({
      name: o.name ?? "",
      phone: o.phone ?? "",
      note: o.note ?? "",
    });
  }

  async function handleDelete(id: string) {
    if (confirm("確定要刪除此工程師嗎？")) {
      await client.models.Operator.delete({ id });
      if (editingId === id) resetForm();
    }
  }

  const filtered = operators.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (o.name ?? "").toLowerCase().includes(q) ||
      (o.phone ?? "").toLowerCase().includes(q)
    );
  });

  const statusLabel: Record<string, string> = {
    CONFIRMED: "已確認",
    FORCE_CHANGE_PASSWORD: "需更改密碼",
    UNCONFIRMED: "未確認",
  };

  return (
    <div className="page">
      {/* 帳號管理 */}
      <section className="panel">
        <h2>🔐 帳號管理</h2>
        <div className="form-grid">
          <label>
            Email *
            <input
              required
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </label>
          <label>
            顯示名稱 *
            <input
              required
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="使用者名稱"
            />
          </label>
          <label>
            臨時密碼（選填）
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="留空則自動產生"
            />
            <span className="field-hint">
              至少 8 字元，需包含大寫、小寫、數字及符號，7 天內有效
            </span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={newIsAdmin}
              onChange={(e) => setNewIsAdmin(e.target.checked)}
            />
            設為管理員
          </label>
          <div className="form-actions">
            <button
              className="btn-primary"
              onClick={createCognitoUser}
              disabled={creating}
            >
              {creating ? "建立中…" : "建立帳號"}
            </button>
          </div>
        </div>

        <div className="panel-head" style={{ marginTop: 20 }}>
          <h2>帳號清單（{cognitoUsers.length}）</h2>
          <button className="btn-secondary" onClick={loadCognitoUsers}>
            {loadingUsers ? "載入中…" : "重新整理"}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>顯示名稱</th>
                <th>狀態</th>
                <th>角色</th>
                <th>建立時間</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {cognitoUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    {loadingUsers ? "載入中…" : "尚無帳號"}
                  </td>
                </tr>
              )}
              {cognitoUsers.map((u) => (
                <tr key={u.username}>
                  <td>{u.email}</td>
                  <td>{u.displayName || "—"}</td>
                  <td>{statusLabel[u.status] ?? u.status}</td>
                  <td>
                    {u.groups.includes("ADMINS") ? (
                      <span className="admin-badge">管理員</span>
                    ) : (
                      "一般使用者"
                    )}
                  </td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="row-actions">
                      {!u.groups.includes("ADMINS") && (
                        <button
                          className="btn-link"
                          onClick={() => toggleAdmin(u.email)}
                        >
                          設為管理員
                        </button>
                      )}
                      <button
                        className="btn-link danger"
                        onClick={() => deleteCognitoUser(u.email)}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 工程師管理 */}
      <section className="panel">
        <h2>{editingId ? "編輯工程師" : "新增工程師"}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            姓名 *
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="請輸入姓名"
            />
          </label>
          <label>
            電話
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="電話號碼"
            />
          </label>
          <label className="full">
            備註
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="備註"
            />
          </label>
          <div className="form-actions full">
            <button type="submit" className="btn-primary">
              {editingId ? "更新工程師" : "新增工程師"}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                取消
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>工程師清單（{filtered.length}）</h2>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋姓名或電話"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>電話</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    尚無工程師資料
                  </td>
                </tr>
              )}
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{o.phone || "—"}</td>
                  <td>{o.note || "—"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-link" onClick={() => handleEdit(o)}>
                        編輯
                      </button>
                      <button
                        className="btn-link danger"
                        onClick={() => handleDelete(o.id)}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>匯款收款人</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={newReceiverName}
            onChange={(e) => setNewReceiverName(e.target.value)}
            placeholder="輸入收款人名稱"
          />
          <button
            className="btn-primary"
            onClick={() => {
              if (!newReceiverName.trim()) { alert("請輸入名稱"); return; }
              client.models.TransferReceiver.create({ name: newReceiverName.trim() });
              setNewReceiverName("");
            }}
          >
            新增
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名稱</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {receivers.length === 0 && (
                <tr><td colSpan={2} className="empty">尚無匯款收款人</td></tr>
              )}
              {receivers.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    <button className="btn-link danger" onClick={() => {
                      if (confirm(`確定要刪除「${r.name}」嗎？`)) client.models.TransferReceiver.delete({ id: r.id });
                    }}>刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>設備管理</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
            placeholder="輸入設備名稱"
          />
          <button
            className="btn-primary"
            onClick={() => {
              if (!newDeviceName.trim()) { alert("請輸入名稱"); return; }
              client.models.Device.create({ name: newDeviceName.trim() });
              setNewDeviceName("");
            }}
          >
            新增
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名稱</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {deviceList.length === 0 && (
                <tr><td colSpan={2} className="empty">尚無設備</td></tr>
              )}
              {deviceList.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>
                    <button className="btn-link danger" onClick={() => {
                      if (confirm(`確定要刪除「${d.name}」嗎？`)) client.models.Device.delete({ id: d.id });
                    }}>刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default UserPage;
