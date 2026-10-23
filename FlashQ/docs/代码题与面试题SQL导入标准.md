# 代码题库 & 面试题库 SQL 导入标准（三库隔离版）

> 本文档是给 AI 或人工生成**可直接在服务器执行**的导入 SQL 的标准规范。
> 核心原则：**不新建表**，复用 `subject` 与 `question` 两张表，通过 `quiz_type` 字段实现三个题库的完全隔离。

---

## 一、三库隔离模型（先理解这个，再写 SQL）

```
┌─────────────────────────────────────────────────────────────┐
│  question 表（所有题目混存在同一张表，靠 quiz_type 区分）        │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ 随机刷题      │ 代码题库      │ 面试题库      │ 自主题库        │
│ quiz_type =  │ quiz_type =  │ quiz_type =  │ custom_question │
│ NULL/it/选择题 │ 'code'       │ 'interview'  │ （独立表，无关）  │
└──────────────┴──────────────┴──────────────┴────────────────┘
        ↑                ↑              ↑
   随机刷题入口      代码题库入口     面试题库入口
   （不传 quizType） （quizType=code）（quizType=interview）
```

### 1.1 隔离是怎么保证的（后端已实现）

| 读取场景 | 后端行为 | 会不会串库 |
|---------|---------|-----------|
| 随机刷题抽题（`/question/random` 不传 quizType） | `quiz_type IS NULL OR (quiz_type != 'code' AND quiz_type != 'interview')` | ❌ 不会读到代码题/面试题 |
| 随机刷题科目列表（`/subject/list` 不传 quizType） | 同样排除 `code`/`interview` 科目 | ❌ 不会看到代码/面试科目 |
| 代码题库抽题（`quizType=code`） | `quiz_type = 'code'` 精确匹配 | ❌ 不会读到其他库 |
| 面试题库抽题（`quizType=interview`） | `quiz_type = 'interview'` 精确匹配 | ❌ 不会读到其他库 |
| IT 错题/收藏复习（不传 quizType） | 排除 `code`/`interview` | ❌ 不会混入代码/面试错题 |
| 代码/面试错题复习（`quizType=code/interview`） | 精确匹配 | ❌ 不会混入 IT 错题 |
| 收藏夹/错题本**管理页**（`quizType=all`） | 不过滤，显示全部（带类型标签） | ✅ 有意为之：管理视图 |

### 1.2 隔离的根基：quiz_type 取值

| quiz_type 值 | 属于哪个库 | 说明 |
|-------------|-----------|------|
| `NULL` | 随机刷题 | 你历史自定义添加的题目 |
| `'it'` | 随机刷题 | 早期系统题目 |
| `'选择题'` | 随机刷题 | 你导入的 flashq_sql 数据（原值保留，不受影响） |
| **`'code'`** | **代码题库** | 本文档新增，**必须精确写 `'code'`** |
| **`'interview'`** | **面试题库** | 本文档新增，**必须精确写 `'interview'`** |

> ⚠️ **最容易出错点**：`quiz_type` 必须严格等于 `'code'` 或 `'interview'`（小写、无多余空格）。
> 写成 `'Code'`、`'CODE'`、`'代码题'` 都会导致隔离失效——题目会掉进随机刷题池或被代码题库漏掉。

---

## 二、代码题库 SQL 标准

### 2.1 科目（subject 表）

```sql
INSERT INTO `subject` (`name`, `quiz_type`, `question_count`) VALUES ('科目名', 'code', 0);
SELECT @sid := LAST_INSERT_ID();
```

- `quiz_type` **固定 `'code'`**
- `question_count` 先填 0，题目插完后统一同步

### 2.2 题目（question 表）

```sql
INSERT INTO `question`
  (`subject_id`, `content`, `option_list`, `answer`, `explanation`,
   `difficulty`, `quiz_type`, `style`, `source`, `is_deleted`, `create_time`)
VALUES
  (@sid, '题干', '["A. 选项1", "B. 选项2", "C. 选项3", "D. 代码报错"]',
   'A', '解析', 1, 'code', 'quick', NULL, 0, NOW());
```

| 字段 | 代码题填法 |
|------|-----------|
| `subject_id` | `@sid`（代码科目 ID） |
| `quiz_type` | **固定 `'code'`** |
| `style` | `'quick'`（快速刷）/ `'quality'`（质量刷） |
| `source` | **固定 `NULL`**（代码题不用企业来源） |
| `difficulty` | `1`/`2`/`3` |

### 2.3 代码题特有规则

1. **题干必须是代码或代码片段**，问输出/结果/复杂度/正确说法
2. **必须包含 `代码报错` 选项**（通常最后一个 D 位）
3. 选项是"可能的输出值或简短描述"，不含代码块
4. `option_list` 是 JSON 数组字符串，内部双引号**无需转义**：`'["A. 1", "B. 2"]'`
5. 题干含英文单引号 `'` → 写成两个 `''`
6. 多行代码用 `\n`

### 2.4 代码题库完整模板（一个科目单元）

```sql
-- ========== 科目名 ==========
INSERT INTO `subject` (`name`, `quiz_type`, `question_count`) VALUES ('科目名', 'code', 0);
SELECT @sid := LAST_INSERT_ID();

INSERT INTO `question`
  (`subject_id`, `content`, `option_list`, `answer`, `explanation`,
   `difficulty`, `quiz_type`, `style`, `source`, `is_deleted`, `create_time`)
VALUES
  -- 快速刷 ×2
  (@sid, '题干1', '["A. xx", "B. xx", "C. xx", "D. 代码报错"]', 'B', '解析1', 1, 'code', 'quick', NULL, 0, NOW()),
  (@sid, '题干2', '["A. xx", "B. xx", "C. xx", "D. 代码报错"]', 'A', '解析2', 2, 'code', 'quick', NULL, 0, NOW()),
  -- 质量刷 ×2（考察陷阱点）
  (@sid, '题干3', '["A. xx", "B. xx", "C. xx", "D. 代码报错"]', 'C', '解析3', 3, 'code', 'quality', NULL, 0, NOW()),
  (@sid, '题干4', '["A. xx", "B. xx", "C. xx", "D. 代码报错"]', 'D', '解析4', 3, 'code', 'quality', NULL, 0, NOW());

UPDATE `subject` SET `question_count` = (SELECT COUNT(*) FROM `question` WHERE `subject_id` = @sid AND `is_deleted` = 0) WHERE `id` = @sid;
```

> 多个科目：整块重复。顺序执行，任一单元失败不影响其他单元。

---

## 三、面试题库 SQL 标准

### 3.1 当前模式：面试题**不分科目**，只分难度与风格

面试题 `subject_id` 固定 `NULL`，通过 `quiz_type='interview'` 隔离。

> 如果以后面试题也需要独立科目，做法与代码科目完全相同：
> `INSERT INTO subject (name, quiz_type, question_count) VALUES ('企业名或方向', 'interview', 0);`
> 并让后端支持 `/subject/list?quizType=interview`（Mapper 已支持，前端后续开放即可）。
> **在开放前，不要给面试题填 subject_id。**

### 3.2 题目（question 表）

```sql
INSERT INTO `question`
  (`subject_id`, `content`, `option_list`, `answer`, `explanation`,
   `difficulty`, `quiz_type`, `style`, `source`, `is_deleted`, `create_time`)
VALUES
  (NULL, '面试问题', '["A. 回答1", "B. 回答2", "C. 回答3", "D. 回答4"]',
   'A', '解析', 3, 'interview', 'quality', '字节跳动', 0, NOW());
```

| 字段 | 面试题填法 |
|------|-----------|
| `subject_id` | **固定 `NULL`** |
| `quiz_type` | **固定 `'interview'`** |
| `style` | `'quick'` / `'quality'` |
| `source` | **企业名**（如 `'腾讯'`）；不知道来源填 `NULL`，前端显示"未知" |
| `difficulty` | quick 建议 `1`/`2`，quality 建议 `3` |

### 3.3 面试题特有规则

1. **题干是面试问题**，选项是对该问题的不同回答（正确选项 = 最完整准确的那个）
2. **没有"代码报错"选项**（那是代码题专利）
3. **`source` 尽量填企业名**，这是面试题的核心信息
4. 快速刷：概念型问题，秒答；质量刷：原理/场景/对比型问题
5. 选项避免"以上都对/都不对"这类无信息量选项

### 3.4 面试题库完整模板

```sql
-- ========== 面试题·快速刷 ==========
INSERT INTO `question`
  (`subject_id`, `content`, `option_list`, `answer`, `explanation`,
   `difficulty`, `quiz_type`, `style`, `source`, `is_deleted`, `create_time`)
VALUES
  (NULL, 'HTTP 状态码 301 和 302 的区别是什么？',
   '["A. 301 永久重定向，302 临时重定向", "B. 301 临时，302 永久", "C. 两者完全相同", "D. 都是客户端错误"]',
   'A', '301 表示资源永久移动，浏览器和搜索引擎会缓存；302 表示临时重定向，不缓存。',
   2, 'interview', 'quick', '阿里巴巴', 0, NOW()),
  (NULL, 'CSS box-sizing: border-box 的作用是？',
   '["A. width 包含 padding 和 border", "B. width 不含 padding", "C. 移除 padding", "D. 禁用 border"]',
   'A', 'border-box 下 width/height 包含 content+padding+border，布局更可控。',
   1, 'interview', 'quick', '美团', 0, NOW());

-- ========== 面试题·质量刷 ==========
INSERT INTO `question`
  (`subject_id`, `content`, `option_list`, `answer`, `explanation`,
   `difficulty`, `quiz_type`, `style`, `source`, `is_deleted`, `create_time`)
VALUES
  (NULL, '浏览器从输入 URL 到页面展示，涉及的主要环节按正确顺序是？',
   '["A. DNS解析 → TCP连接 → HTTP请求 → 服务端响应 → 解析渲染", "B. 仅 DNS 解析", "C. 仅 HTTP 请求", "D. 先渲染再请求"]',
   'A', '完整链路包含 DNS 解析、TCP 握手、HTTP 请求响应、浏览器解析与渲染等环节。',
   3, 'interview', 'quality', '字节跳动', 0, NOW());
```

---

## 四、AI 生成提示词模板（直接复制使用）

### 4.1 生成代码题库 SQL

```
请为 FlashQ 小程序"代码题库"生成 MySQL 导入 SQL，严格遵守以下标准：

【隔离铁律】quiz_type 必须精确等于小写 'code'，多一个空格或大小写错误都会导致题目串库！
【科目】每个科目一个单元：
  INSERT INTO subject (name, quiz_type, question_count) VALUES ('科目名', 'code', 0);
  SELECT @sid := LAST_INSERT_ID();
【题目】字段：subject_id(用@sid), content, option_list, answer, explanation,
  difficulty(1/2/3), quiz_type(固定'code'), style('quick'或'quality'),
  source(固定NULL), is_deleted(0), create_time(NOW())
【代码题规则】
  - 题干为代码或代码片段，问输出/结果/复杂度/正确说法
  - 选项必须包含"代码报错"（放最后D位）
  - option_list 为 JSON 数组字符串如 '["A. xxx", "B. yyy", "D. 代码报错"]'，内部双引号无需转义
  - answer 只填纯字母如 'B'
  - 题干含英文单引号要写成两个单引号；多行代码用 \n
【数量】每个科目 2 道 quick + 2 道 quality，quality 考察陷阱点
【收尾】每个科目单元末尾执行：
  UPDATE subject SET question_count = (SELECT COUNT(*) FROM question WHERE subject_id = @sid AND is_deleted = 0) WHERE id = @sid;
【文件头】SET NAMES utf8mb4; USE quiz_db;
【编码】UTF-8，中文不转义，只输出 SQL 不要多余解释

需要生成的科目：<填科目列表>
```

### 4.2 生成面试题库 SQL

```
请为 FlashQ 小程序"面试题库"生成 MySQL 导入 SQL，严格遵守以下标准：

【隔离铁律】quiz_type 必须精确等于小写 'interview'！
【题目】字段：subject_id(固定NULL), content, option_list, answer, explanation,
  difficulty(1/2/3), quiz_type(固定'interview'), style('quick'或'quality'),
  source(企业名，不知道填NULL), is_deleted(0), create_time(NOW())
【面试题规则】
  - 题干为面试问题，选项是对该问题的不同回答，正确选项=最完整准确的那个
  - 没有"代码报错"选项
  - source 尽量填真实企业名（如 腾讯/字节跳动/阿里巴巴/美团/京东），未知填 NULL
  - quick 为概念型问题（难度1-2），quality 为原理/场景/对比型问题（难度3）
  - option_list 为 JSON 数组字符串如 '["A. xxx", "B. yyy"]'，内部双引号无需转义
  - answer 只填纯字母；题干含英文单引号写成两个单引号
【数量】生成 <N> 道 quick + <N> 道 quality，覆盖 <技术方向列表>
【文件头】SET NAMES utf8mb4; USE quiz_db;
【编码】UTF-8，中文不转义，只输出 SQL 不要多余解释
```

---

## 五、可直接执行的完整示例

项目内已附带一份**可直接运行**的代码题库示例：
`FlashQ/src/main/resources/migration_code_subjects.sql`
（含 4 个完整科目 Java/Python/C语言/数据结构 + 16 道题 + 8 个预留空科目 + 验证 SQL）

面试题库可把本文档 3.4 节模板直接交给 AI 扩写。

**导入命令**：
```bash
mysql -u root -p quiz_db < your_file.sql
```

---

## 六、导入后必须验证（防串库自检）

```sql
-- 1) 三库题目分布（应只有三行左右，数值符合预期）
SELECT COALESCE(quiz_type, 'NULL(随机题库)') AS 题库, style, COUNT(*) AS 题数
FROM question WHERE is_deleted = 0
GROUP BY quiz_type, style ORDER BY quiz_type;

-- 2) 随机刷题池实际能抽到的题（模拟后端不过滤时的查询，结果不应包含 code/interview）
SELECT id, quiz_type, LEFT(content, 30) AS 题干前缀
FROM question
WHERE is_deleted = 0
  AND (quiz_type IS NULL OR (quiz_type != 'code' AND quiz_type != 'interview'))
ORDER BY id DESC LIMIT 20;

-- 3) 代码科目列表（应只看到 quiz_type='code'）
SELECT id, name, quiz_type, question_count FROM subject WHERE quiz_type = 'code' ORDER BY id;

-- 4) 检查是否有"几乎写错"的 quiz_type（应返回 0 行；有结果说明大小写/空格写错了）
SELECT DISTINCT quiz_type FROM question WHERE quiz_type IS NOT NULL
  AND quiz_type NOT IN ('it', '选择题', 'code', 'interview');

-- 5) 面试题来源抽样
SELECT id, source, style, LEFT(content, 30) AS 题干前缀
FROM question WHERE quiz_type = 'interview' AND is_deleted = 0 ORDER BY id DESC LIMIT 10;
```

**第 4 条是关键**：如果查出 `'Code'`、`'CODE'`、`'代码'` 之类的值，立即修正：
```sql
-- 假设误写为 'Code'
UPDATE question SET quiz_type = 'code' WHERE quiz_type = 'Code';
```

---

## 七、FAQ

### Q1：不新建表，三库真的不会互相干扰吗？
会干扰的场景只有一种：**`quiz_type` 写错**（大小写、空格、中文）。只要严格写 `'code'`/`'interview'`，后端所有读取路径都已按类型隔离（见 1.1 节表格）。建议每次导入后跑第六节第 4 条自检。

### Q2：我以前的随机题库题目/科目会受影响吗？
完全不受影响。隔离逻辑是"排除法"：随机题库 = 全部题目中排除 code/interview，你的历史题目（NULL/it/选择题）原样保留。

### Q3：代码题和面试题能互相看到吗？
不能。代码题库只查 `quiz_type='code'`，面试题库只查 `quiz_type='interview'`。

### Q4：收藏夹/错题本页面为什么能看到所有类型的题？
那是**跨题库管理视图**（带"代码题/面试题"标签），方便统一管理。而各库的"专项复习"入口（review-select 页）严格按库筛选，刷题时不会串。

### Q5：面试题以后想分科目怎么办？
把 subject 的 `quiz_type` 写 `'interview'` 插入科目，题目 `subject_id` 指向该科目即可——后端 `findByQuizType` 已支持 `?quizType=interview`，只需前端后续开放入口。**未开放前不要填 subject_id。**

### Q6：想清空重导某个库？
```sql
-- 清空代码题库（题目+科目）
DELETE FROM question WHERE quiz_type = 'code';
DELETE FROM subject WHERE quiz_type = 'code';
-- 清空面试题库
DELETE FROM question WHERE quiz_type = 'interview';
-- 注意：不要顺手删 favorite/wrong_question，那是用户数据；
-- 若题目已删，收藏/错题记录可顺带清理：
DELETE FROM favorite WHERE question_id NOT IN (SELECT id FROM question);
DELETE FROM wrong_question WHERE question_id NOT IN (SELECT id FROM question);
```
