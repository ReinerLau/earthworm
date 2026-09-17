---
name: lexical-chunks
description: 使用固定词库、句法模型和规则将英文教材拆成无重叠语块，并生成逐语块简体中文语境释义和整句翻译；适用于用户粘贴英文并要求语块报告或释义。
---

# 教材语块与语境释义

脚本使用固定 Open English WordNet、句法模型和版本化规则生成确定性英文语块。模型只为脚本输出的每个语块生成简洁的简体中文语境释义，并为每个完整原句生成自然翻译；释义不参与或改变英文拆分。

## 执行

1. 创建临时目录，将用户粘贴的英文原样传给分析模式：

   ```bash
   uv run <skill目录>/scripts/split_lexical_chunks.py \
     --analysis-output <临时目录>/analysis.json
   ```

   脚本打印实际分析文件的绝对路径。读取该 JSON，不增删、重排或修正其中的原句和语块。

2. 按出现位置为每个语块生成当前原句中的简短释义。冠词、连词等没有直接中文对应时，给出简短语法说明。生成严格符合以下结构的纯 JSON；数组长度和顺序必须与分析文件一一对应，且不加入英文原文：

   ```json
   {
     "schema_version": 1,
     "sentences": [
       {
         "chunk_meanings": ["逐语块释义"],
         "sentence_translation": "自然的整句翻译。"
       }
     ]
   }
   ```

3. 将释义 JSON 原样传给渲染模式的标准输入：

   ```bash
   uv run <skill目录>/scripts/split_lexical_chunks.py \
     --render-analysis <实际分析文件> \
     --output outputs/lexical-chunks/text.chunks.md
   ```

   渲染器严格校验句子数、语块数、字段、类型和空值，通过后按原句分组生成报告并打印绝对路径。输出已存在时自动使用 `text-2.chunks.md` 等递增名称。

4. 确认最终文件存在，对话只返回该文件的可点击链接，不展开语块内容或增加统计。

首次运行会下载固定的 `oewn:2025` 词库和脚本声明的固定句法依赖，此后复用本地缓存。相同环境下英文拆分可重复；模型生成的中文措辞可能不同。

## 失败处理

分析失败时返回错误摘要，不改用模型拆分或降级报告。注释校验失败时按错误修正 JSON 并重试一次；再次失败则返回错误摘要，不生成残缺报告。没有英文输入时请用户提供教材正文。

工具关系、选型理由和已知边界见项目中的 `docs/lexical-chunks-tooling.md`。
