# 在线面料检测平台 · 服务器部署操作说明

本平台为**全栈版本**（前端静态页面 + Express 后端 + SQLite 数据库），部署后数据存储于服务器数据库，
**跨设备 / 跨浏览器共享同一份数据，实现真正的线上同步**。无需登录，所有访问者共用同一份数据。

> **重要（数据持久化）**：后端支持两种数据库：
> - **云端 SQLite（Turso）**：配置 `TURSO_URL` / `TURSO_TOKEN` 后，数据存云端，免费托管也不会丢、跨设备同步。**推荐。**
> - **本地 SQLite**：未配置 `TURSO_URL` 时用本地文件。在免费托管（如 Render free）上**重启会丢数据**，只适合临时演示。

---

## 〇、免费托管部署（Render + 云端数据库，推荐免费方案）

这是不花钱即可上线、且数据能持久保存的方式：**Render 免费部署后端 + Turso 免费云端 SQLite**。

### 第 1 步：创建 Turso 云端数据库（数据持久化关键）

1. 打开 <https://turso.tech> 注册（免费档无需绑卡）。
2. 创建数据库，进入 Dashboard，拿到两样东西：
   - **连接串**：形如 `libsql://xxx.turso.io`
   - **认证令牌 Token**（可选，公开数据库可不填）

### 第 2 步：把项目推送到 GitHub

本机项目目录 `fabric-platform` 就是完整项目，在 GitHub 新建一个仓库后：

```bash
cd fabric-platform
git init
git add -A
git commit -m "fabric detection platform"
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

### 第 3 步：在 Render 创建 Web 服务

1. 打开 <https://render.com> 注册（免费档，GitHub 账号登录最快）。
2. **New + → Web Service** → 选择刚推送的 GitHub 仓库。
3. Render 会读取项目里的 **`render.yaml`**（我已写好），按默认即可，或手动核对：
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `node server/index.js`
   - Health Check Path: `/api/health`
4. **添加环境变量**（关键，决定数据存云端）：
   - `TURSO_URL` = 第 1 步的 Turso 连接串
   - `TURSO_TOKEN` = Turso 令牌（可选）
5. 点击 **Create Web Service**，等待构建完成。
6. 构建成功后，Render 会给一个公网地址，形如 `https://xxxx.onrender.com`。

### 第 4 步：验证线上同步

1. **设备 A** 打开 Render 给你的地址 → 面料检测 → 新建检测单并提交。
2. **设备 B**（另一台电脑/手机/浏览器）打开同一地址 → 应能立刻看到新增数据。
3. 多设备操作同一数据，即真同步。数据存 Turso 云端，重启/重部署不丢。

> 免费档限制：实例无请求时会休眠（约 15 分钟无流量自动停），再次访问会慢几秒重启。对日常小规模使用足够。

---

## 一、环境要求

## 一、环境要求

- **Node.js**：v18 及以上（推荐 v20/v22）
- **npm**：随 Node 附带
- **磁盘**：几十 MB 即可（SQLite 单文件）
- 可选：Docker（用于容器化部署）

---

## 二、快速启动（无需 Docker）

### 1. 上传项目到服务器

将整个 `fabric-platform` 目录上传到服务器任意位置，例如 `/opt/fabric-platform`：

```bash
scp -r fabric-platform/ root@你的服务器IP:/opt/
```

### 2. 安装依赖

```bash
cd /opt/fabric-platform
npm install
```

### 3. 启动服务（前台测试）

```bash
node server/index.js
```

看到日志 `[fabric-platform] 后端已启动: http://localhost:3001` 即成功。
浏览器访问 `http://服务器IP:3001` 即可打开平台。

### 4. 常驻运行（推荐用 PM2）

```bash
# 全局安装 PM2
npm install -g pm2

# 启动
pm2 start server/index.js --name fabric-platform

# 开机自启
pm2 save
pm2 startup
```

常用管理命令：

```bash
pm2 logs fabric-platform   # 查看日志
pm2 restart fabric-platform  # 重启
pm2 stop fabric-platform   # 停止
```

---

## 三、Docker 部署（可选）

```bash
cd /opt/fabric-platform

# 构建并启动
docker compose up -d --build

# 查看状态
docker compose ps
docker logs fabric-platform

# 停止
docker compose down
```

数据通过 `./server/data` 卷持久化在宿主机，容器重建不丢数据。

---

## 四、初始化种子数据

首次启动会自动写入种子数据（8 个检测单、3 个采购单、10 种面料、5 家供应商）。
如需**重置数据**，删除数据库文件后重启服务即可：

```bash
# 非 Docker
rm -f /opt/fabric-platform/server/data/app.db*
pm2 restart fabric-platform

# Docker
rm -f /opt/fabric-platform/server/data/app.db*
docker compose restart
```

---

## 五、验证线上同步（重要）

平台通过同一后端数据库实现跨设备共享，按以下步骤验证：

1. **设备 A** 打开 `http://服务器IP:3001` → 面料检测 → 新建一个检测单并提交。
2. **设备 B**（换另一台电脑 / 手机 / 不同浏览器）打开同一地址 → 面料检测列表，**应能立刻看到设备 A 新增的检测单**。
3. 在设备 B 修改 / 删除该检测单，回到设备 A 刷新，**应能看到变化**。
4. 面料库新增面料、采购单创建等操作同样实时同步。

> 只要多台设备访问同一个 `http://服务器IP:3001`，它们操作的都是服务器上同一份数据库，天然同步。
> 若出现"不同步"，多为访问了不同的地址 / 端口，或缓存，刷新即可。

---

## 六、API 一览（供对接/排查）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/meta | 检测标准 / 项目 / 限值 |
| GET/POST | /api/inspections | 检测单 查/增 |
| PUT/DELETE | /api/inspections/:id | 检测单 改/删 |
| GET/POST | /api/purchases | 采购单 查/增 |
| PUT/DELETE | /api/purchases/:id | 采购单 改/删 |
| GET/POST | /api/suppliers | 供应商 查/增 |
| PUT/DELETE | /api/suppliers/:id | 供应商 改/删 |
| GET/POST | /api/fabrics | 面料库 查/增 |
| PUT/DELETE | /api/fabrics/:id | 面料库 改/删 |

---

## 七、常见问题

- **端口占用**：如需换端口，修改环境变量 `PORT`（如 `PORT=8080 node server/index.js`），或改 docker-compose 的端口映射。
- **外网访问**：云服务器需在安全组 / 防火墙放行所选端口（默认 3001）。
- **数据库位置**：默认 `server/data/app.db`，可经环境变量 `DB_PATH` 自定义。
