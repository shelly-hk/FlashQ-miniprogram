# 代码题库科目 SQL 导入指南

> 代码题库拥有**独立于随机刷题的科目体系**：代码科目存放在 `subject` 表，用 `quiz_type='code'` 标记；
> 随机刷题科目（`quiz_type` 为 NULL/`it`/`选择题`）不会与代码科目混淆，二者互不干扰。
>
> 本文档说明如何把代码科目与代码题目写入数据库。生成 SQL 时请严格遵守字段格式。

---

## 一、核心原理（30 秒理解）

| 数据 | 存放表 | 关键字段值 |
|------|--------|-----------|
| 代码科目 | `subject` | `quiz_type = 'code'` |
| 代码题目 | `question` | `quiz_type = 'code'`、`style = 'quick'/'quality'`、`subject_id` 指向代码科目 |

前端"代码题库"入口只请求 `quiz_type='code'` 的科目；随机刷题请求已被后端自动排除 `code`/`interview` 科目。**因此你不需要改动任何现有科目数据。**

---

## 二、表字段速查

### 2.1 subject 表（代码科目）

| 字段 | 是否必填 | 代码科目填法 |
|------|---------|-------------|
| `id` | 否（自增） | 不写 |
| `name` | **是** | 科目名，如 `'Java'`、`'数据结构'` |
| `quiz_type` | **是** | **固定 `'code'`**（这是与随机刷题区分的唯一标志） |
| `question_count` | 建议 | 先填 `0`，题目插入后用文末 UPDATE 语句同步 |

### 2.2 question 表（代码题目）

| 字段 | 是否必填 | 代码题目填法 |
|------|---------|-------------|
| `id` | 否（自增） | 不写 |
| `subject_id` | **是** | 代码科目 ID，用 `@sid` 变量承接（见模板） |
| `content` | **是** | 题干（代码片段用 `\n` 换行） |
| `option_list` | **是** | 选项 JSON 数组字符串 |
| `answer` | **是** | 正确选项纯字母，如 `'B'` |
| `explanation` | 建议 | 答案解析 |
| `difficulty` | **是** | `1`=初 / `2`=中 / `3`=高 |
| `quiz_type` | **是** | **固定 `'code'`** |
| `style` | **是** | `'quick'`=快速刷 / `'quality'`=质量刷 |
| `source` | 否 | 代码题固定 `NULL`（面试题才用） |
| `is_deleted` | 否 | 固定 `0` |
| `create_time` | 否 | `NOW()` |

---

## 三、标准插入模板（一个科目 + 其题目）

**每个科目作为独立单元**，按此模板成组书写。`@sid` 会自动承接刚插入科目的 ID：

```sql
-- ========== 科目名 ==========
INSERT INTO `subject` (`name`, `quiz_type`, `question_count`) VALUES ('科目名', 'code', 0);
SELECT @sid := LAST_INSERT_ID();

INSERT INTO `question`
  (`subject_id`, `content`, `option_list`, `answer`, `explanation`,
   `difficulty`, `quiz_type`, `style`, `is_deleted`, `create_time`)
VALUES
  -- 快速刷题目
  (@sid, '题干1', '["A. 选项1", "B. 选项2", "C. 选项3", "D. 代码报错"]', 'A', '解析1', 1, 'code', 'quick', 0, NOW()),
  (@sid, '题干2', '["A. 选项1", "B. 选项2", "C. 选项3", "D. 代码报错"]', 'C', '解析2', 2, 'code', 'quick', 0, NOW()),
  -- 质量刷题目
  (@sid, '题干3', '["A. 选项1", "B. 选项2", "C. 选项3", "D. 代码报错"]', 'B', '解析3', 3, 'code', 'quality', 0, NOW());

-- 同步科目题目数
UPDATE `subject` SET `question_count` = (SELECT COUNT(*) FROM `question` WHERE `subject_id` = @sid AND `is_deleted` = 0) WHERE `id` = @sid;
```

**多个科目**：把上面这整块重复多次即可，顺序执行。

---

## 四、代码题特有规则

1. **题干必须是代码或代码片段**，问"输出什么 / 运行结果 / 时间空间复杂度 / 哪个说法正确"。
2. **选项必须包含 `代码报错`**（通常放最后一个 D 位），这是代码题的标志性选项。
3. **选项内容要简洁**，是可能的输出值或简短描述。
4. **快速刷**：一句话题干、秒答；**质量刷**：需要分析（如包装类型、缓存、复杂度等陷阱点）。
5. `option_list` 是 JSON 数组字符串，双引号直接写即可（MySQL 单引号字符串内的 `"` 无需转义）：
   - ✅ `'["A. 33", "B. 123", "D. 代码报错"]'`
   - ❌ `'[\"A. 33\"]'`（也能存，但不推荐，可读性差）
6. 题干含英文单引号 `'` 时必须写成两个单引号 `''`。

---

## 五、完整可运行示例

项目内已附带一份可直接执行的示例文件：

**`FlashQ/src/main/resources/migration_code_subjects.sql`**

包含：
- 4 个已填充科目的完整示例（Java / Python / C语言 / 数据结构，每个含快速刷 + 质量刷题目）
- 8 个预留空科目（C++ / JavaScript / TypeScript / Go / Rust / 算法 / SQL / Linux Shell），后续按模板补充
- 验证查询 SQL 与重复执行前的清理语句

导入方式：

```bash
mysql -u root -p quiz_db < FlashQ/src/main/resources/migration_code_subjects.sql
```

---

## 六、让其他 AI 生成题目 SQL 的提示词模板

把下面这段话连同题目需求一起发给 AI，即可得到合规 SQL：

```
请为 FlashQ 小程序的"代码题库"生成 MySQL 导入 SQL，要求：
1. 代码科目写入 subject 表：INSERT INTO subject (name, quiz_type, question_count) VALUES ('科目名', 'code', 0);
   随后 SELECT @sid := LAST_INSERT_ID();
2. 代码题目写入 question 表，字段：subject_id(用@sid), content, option_list, answer, explanation,
   difficulty, quiz_type(固定'code'), style('quick'或'quality'), is_deleted(0), create_time(NOW())
3. 每个科目作为一个独立单元：先插科目，再插该科目的题目，最后执行
   UPDATE subject SET question_count = (SELECT COUNT(*) FROM question WHERE subject_id = @sid AND is_deleted = 0) WHERE id = @sid;
4. 代码题规则：题干为代码或代码片段；选项必须包含"代码报错"（放最后D位）；
   option_list 为 JSON 数组字符串如 '["A. xxx", "B. yyy", "D. 代码报错"]'，内部双引号无需转义；
   answer 只填纯字母如 'B'；题干含英文单引号要写成两个单引号。
5. 每个科目给出 2 道快速刷(quick) + 2 道质量刷(quality)，质量刷考察陷阱点（如缓存、复杂度、引用语义）。
6. 文件开头写 SET NAMES utf8mb4; USE quiz_db;
7. 用 UTF-8 编码输出，中文不要转义。

需要生成的科目：<在这里列出科目，如：C++、Go、Rust>
```

---

## 七、导入后验证

```sql
-- 1) 代码题库科目列表（应只看到 quiz_type='code'）
SELECT id, name, quiz_type, question_count FROM subject WHERE quiz_type = 'code' ORDER BY id;

-- 2) 各代码科目题目数统计
SELECT s.name, q.style, COUNT(*) AS cnt
FROM question q JOIN subject s ON q.subject_id = s.id
WHERE q.quiz_type = 'code' AND q.is_deleted = 0
GROUP BY s.name, q.style;

-- 3) 确认随机刷题科目不含代码科目（此查询不应返回任何行）
SELECT id, name, quiz_type FROM subject WHERE quiz_type = 'code';
-- 预期：随机刷题页面看不到这些科目（后端 /api/subject/list 已自动排除）
```

---

## 八、常见问题

### Q1：代码科目会出现在随机刷题的科目列表里吗？
**不会。** 后端 `/api/subject/list`（不传 quizType）已自动排除 `quiz_type='code'/'interview'` 的科目。

### Q2：我之前的自定义科目会受影响吗？
**不会。** 过滤条件保留 `quiz_type IS NULL` 与历史值（如 `'选择题'`）的科目，只排除新增的 `code`/`interview`。

### Q3：想给科目补充题目怎么办？
找到该科目 ID 后，参照第三节模板，只写 `INSERT INTO question ... VALUES (@sid, ...)` 部分（把 `@sid` 替换为该科目真实 ID，或先 `SET @sid = 科目ID;`），最后重新执行一次 Q2 的 UPDATE 同步题数。

### Q4：想删除某个代码科目及其题目？
```sql
DELETE FROM `question` WHERE `subject_id` = 科目ID AND `quiz_type` = 'code';
DELETE FROM `subject` WHERE `id` = 科目ID AND `quiz_type` = 'code';
```

### Q5：重复导入报重复科目名怎么办？
先执行清理（文件末尾已提供），再重新导入：
```sql
DELETE FROM `question` WHERE `quiz_type` = 'code';
DELETE FROM `subject` WHERE `quiz_type` = 'code';
```
