---
name: lexical-chunks
description: 将英文教材按确定性实义核心和渐进组合规则生成中英打字练习；适用于用户提供英文并要求渐进学习单元、语块练习或辅助背诵。
---

# 教材渐进学习单元

脚本使用固定 OEWN、词性模型和版本化规则生成全部英文学习单元。模型只为脚本确定的单元填写自然中文提示，不选择、增删或重排英文。

## 固定语义

- OEWN 最长非重叠匹配保留 lemma、词典词性和匹配方式，再与当前句的词性及语法角色共同判断实义核心；未被 OEWN 覆盖的名词、实义动词、形容词、副词等由上下文规则补充。
- 功能性词性或语法角色优先排除。OEWN 表层直接命中且不承担功能角色时，可抵抗统计模型的上下文词性误标；规则不维护教材词汇白名单。
- 所有实义核心先按原文顺序独立出题，再按规则从右向左逐个组合。每次组合加入一个相邻实义核心，并把两者之间的原文完整带入。
- 冠词、代词、系动词、助动词、介词和连词等连接成分随组合进入，不独立出题。完整原句由渲染器追加为最后一步。
- 中文提示表达对应英文单元在当前句中的自然含义。中文可能对应多种英语；本练习只检查教材表达复现。

例如 `Birdsong is good for our mental health.` 固定生成：`Birdsong`、`good`、`mental health`、`good for our mental health`，最后是完整原句。`for our` 在组合 `good` 与 `mental health` 时进入，`is` 在最终组合时进入。

## 执行

1. 创建临时目录，将用户粘贴的英文原样传给分析模式：

   ```bash
   uv run <skill目录>/scripts/split_lexical_chunks.py \
     --analysis-output <临时目录>/analysis.json
   ```

   脚本打印实际分析文件的绝对路径。分析 JSON 使用 schema 4，每句的 `atoms` 保存 OEWN 与句法证据，`learning_units` 已包含不可修改的英文、原文范围、类型和实义核心数量。

2. 按 `learning_units` 的现有顺序生成严格对齐的简体中文提示，不重复英文：

   ```json
   {
     "schema_version": 4,
     "sentences": [
       {
         "unit_prompts": ["逐单元自然中文提示"],
         "sentence_translation": "自然的整句中文提示。"
       }
     ]
   }
   ```

   `unit_prompts` 的数量和位置必须与分析文件完全一致。实义核心按其当前语境给出简短对应义；组合单元使用完整、自然的中文短语或分句。

3. 将提示 JSON 原样传给渲染模式的标准输入：

   ```bash
   uv run <skill目录>/scripts/split_lexical_chunks.py \
     --render-analysis <实际分析文件> \
     --output outputs/lexical-chunks/text.learning-units.md
   ```

   渲染器重新验证分析文件的确定性组合结果，再校验提示 schema、句子数、单元数、字段类型和空值。输出已存在时自动使用递增文件名。

4. 确认最终文件存在，对话只返回该文件的可点击链接。

首次运行会下载固定 OEWN 和句法模型，此后复用本地缓存。英文学习单元在相同环境下可复现；模型生成的中文措辞可能不同。

## 失败处理

分析失败时返回错误摘要。提示校验失败时按错误修正 JSON 并重试一次；再次失败则返回错误摘要，不生成残缺报告。没有英文输入时请用户提供教材正文。

工具关系、规则结构和边界见项目中的 `docs/lexical-chunks-tooling.md`。
