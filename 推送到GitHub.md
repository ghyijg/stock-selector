# 把「选股网站」推到 GitHub

本地已经完成：**Git 初始化、.gitignore、首次提交**。你只需要在 GitHub 上建一个仓库，然后按下面做一次即可。

---

## 第一步：在 GitHub 上新建仓库

1. 打开浏览器访问：**https://github.com/new**
2. 若未登录，先登录你的 GitHub 账号。
3. 填写：
   - **Repository name**：例如 `stock-selector` 或 `选股网站`（英文名更省事）
   - **Description**：可选，如 “A股选股网站”
   - 选择 **Public**
   - **不要**勾选 “Add a README file”
   - 直接点 **Create repository**
4. 创建完成后，页面上会有一个仓库地址，类似：
   - `https://github.com/你的用户名/stock-selector.git`
   - 或 `git@github.com:你的用户名/stock-selector.git`
   - 复制这个地址，下一步要用。

---

## 第二步：在电脑上添加远程并推送

**用 CMD（命令提示符）**，不要用 PowerShell，避免中文路径问题：

1. **Win + R** 输入 `cmd` 回车，打开命令提示符。
2. 输入下面两行（把 `你的仓库地址` 换成你刚复制的地址）：

```bat
d:
cd \选股网站
git remote add origin 你的仓库地址
git branch -M main
git push -u origin main
```

例如你的地址是 `https://github.com/zhangsan/stock-selector.git`，就写成：

```bat
git remote add origin https://github.com/zhangsan/stock-selector.git
git branch -M main
git push -u origin main
```

3. 第一次 `git push` 可能会弹出浏览器或窗口让你登录 GitHub，按提示完成即可。
4. 推送成功后，在 GitHub 仓库页面刷新，就能看到代码了。

---

## 第三步：用 Vercel 部署（手机可访问）

1. 打开 **https://vercel.com**，用 GitHub 登录。
2. 点击 **Add New → Project**，选中刚推送的 **stock-selector**（或你起的仓库名）。
3. **Framework Preset** 选 **Vite**，然后点 **Deploy**。
4. 部署完成后会给你一个地址，如 `https://stock-selector-xxx.vercel.app`，用手机浏览器打开即可使用。

---

## 若推送时提示 “Support for password authentication was removed”

说明需要用**个人访问令牌**代替密码：

1. 打开：https://github.com/settings/tokens
2. **Generate new token (classic)**，勾选 **repo**，生成后复制令牌（只显示一次）。
3. 在 `git push` 时，密码处粘贴这个令牌即可。

---

## 可选：以后改 Git 用户名/邮箱

若希望提交记录显示你的名字和邮箱，在 **选股网站** 目录下执行（把下面换成你的信息）：

```bat
git config user.name "你的名字"
git config user.email "你的GitHub邮箱"
```

之后的新提交就会用这个信息。
