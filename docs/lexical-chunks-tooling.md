# 教材渐进学习单元工具与架构

本文记录 `lexical-chunks` skill 的接口、确定性规则和校验边界。学习目标遵循 [ADR 0001](adr/0001-textbook-expression-reproduction.md)，英文编排遵循 [ADR 0002](adr/0002-deterministic-progressive-learning-units.md)。

## 当前设计

英文单元完全由脚本生成，模型只补充中文：

1. 分句并保留每个英文 token 的原文字符范围，使用固定句法模型取得上下文词性、依存角色和字符位置。
2. 使用固定 OEWN 与 Morphy 收集单词和多词表达，保留 lemma、词典词性及表层或 Morphy 匹配方式，再选择最长且互不重叠的匹配。
3. 多词 OEWN 优先；词典未覆盖时，将固定句法模型标为连续 `VERB + prt` 的结构识别为不可拆的动词小品词核心；随后才采用单词 OEWN 和普通 token。
4. 通用规则先排除功能角色，再结合 OEWN 或句法回退证据判断实义，未被 OEWN 覆盖的其他实义词由上下文词性补充。
5. 每个实义核心先独立成为学习单元。
6. 根据原子的依存中心关系识别连续名词前置修饰结构，先从名词中心向左形成自然名词短语。
7. 对相邻的右侧名词组检查 `pobj → prep → NOUN/PROPN` 依存链，逐步形成 `noise from traffic` 一类简单后置修饰名词短语。
8. 将已学名词短语视为不可拆的组合组，再从最右侧组开始向左折叠；连接成分由组间原文切片自动带入。
9. 模型按位置填写中文提示，渲染器校验后追加完整原句。

规则位于 `rules/progression-rules.json`。人工校正面向规则和回归样本，不逐句修改分析结果。

## Birdsong 示例

原句：

```text
Birdsong is good for our mental health.
```

最长 OEWN 与词性分析得到三个实义核心：

```text
Birdsong | good | mental health
```

它们全部独立出题。随后右向折叠最右侧两个核心，原文区间自动带入 `for our`：

```text
good + mental health
→ good for our mental health
```

覆盖全部核心的最后一次合并由完整原句承担，因此 `is` 在最终步骤进入。最终顺序为：

```text
Birdsong
good
mental health
good for our mental health
Birdsong is good for our mental health.
```

## 外部接口

CLI 有三个模式：

- `--analysis-output <路径>`：从标准输入读取英文，输出 schema 7 分析 JSON。
- `--render-analysis <路径> --output <路径>`：读取严格对齐的中文提示 JSON，生成 Markdown。
- 不传分析或渲染参数：生成兼容的英文单列表格，内容与确定性学习单元一致。

默认路径为 `outputs/lexical-chunks/text.learning-units.md`。同名文件存在时生成 `text-2.learning-units.md` 等递增名称。任何校验失败都返回非零状态且不创建报告。

### 分析 JSON

```json
{
  "schema_version": 7,
  "sentences": [
    {
      "sentence": "Birdsong is good for our mental health.",
      "atoms": [
        {
          "text": "good",
          "start": 12,
          "end": 16,
          "source": "oewn",
          "lexicon_lemmas": ["good"],
          "lexicon_pos": ["a"],
          "match_kind": "surface",
          "head_pos": "ADJ",
          "head_dep": "ROOT",
          "head_atom": null,
          "core": true
        }
      ],
      "learning_units": [
        {
          "text": "good",
          "start": 12,
          "end": 16,
          "kind": "core",
          "core_count": 1
        }
      ]
    }
  ]
}
```

`atoms` 保存可审计的证据来源、OEWN lemma、词典词性、匹配方式、上下文中心词性、依存角色、依存中心原子和实义判断。`head_atom` 是直接句法中心所在原子的零基索引，根节点为 `null`。普通 token 的词典数组为空且 `match_kind` 为 `none`；句法回退使用 `source: "syntax"`、`match_kind: "verb_particle"`，词典数组仍为空。`learning_units` 是脚本确定的最终中间步骤：

- `kind: core` 表示必须独立出题的实义核心。
- `kind: composition` 表示由多个相邻实义核心组成的连续原文片段。
- `core_count` 表示该单元包含的实义核心数量。

加载分析文件时，渲染器根据 `atoms` 重新计算全部学习单元；任何文本、范围、顺序或组合被修改都会拒绝渲染。

### 中文提示 JSON

```json
{
  "schema_version": 7,
  "sentences": [
    {
      "unit_prompts": [
        "鸟鸣",
        "有益的",
        "心理健康",
        "对我们的心理健康有益"
      ],
      "sentence_translation": "鸟鸣有益于我们的心理健康。"
    }
  ]
}
```

提示 JSON 不携带英文，只按位置提供中文。句子数和每句提示数必须与分析完全一致；根对象和句子对象都拒绝未知字段。

## 确定性规则

### 实义核心

OEWN 同时参与单词和多词表达匹配。候选按“长度降序、位置升序”选择，较长表达覆盖内部单词。例如 `mental health` 被选中后，不再分别输出 `mental` 和 `health`。

词典选择后，脚本在剩余位置查找连续的动词小品词结构：小品词必须以 `prt` 直接依附于紧邻在前的 `VERB`，两者之间只能有空白，且 spaCy token 必须与内部 token 精确对齐。已选中的多词 OEWN 表达优先于句法回退；句法回退优先于两个单词各自的 OEWN 匹配。合并结果作为一个 `core_count: 1` 的不可拆实义核心。普通介词结构、带插入词的结构和分离结构不会在原子识别阶段合并为单一实义核心；符合后置修饰规则的介词结构只在后续渐进组合阶段形成名词短语。

单词还需结合当前句中的词性和依存角色。判定顺序固定为：

1. 中心词若属于配置的功能词性或功能依存角色，不作为核心。`is` 即使命中 OEWN 的 `be`，在句中仍因 `AUX` 被排除；名词义的 `A` 也会因 `DET/det` 被排除。
2. 多词 OEWN 表达直接作为核心。
3. 单词的 OEWN 词性若与上下文词性兼容，作为核心。
4. OEWN 表层直接命中、且未触发功能排除时，作为核心。这一通用兜底可保留被统计模型误标为 `ADP/advmod` 的 `birdsong`，无需词汇白名单。
5. 未命中 OEWN 的 token 若属于配置的上下文实义词性，作为补充核心。

Morphy 匹配不使用第 4 条兜底，必须得到词典词性与上下文词性的兼容证据。人工维护仅针对通用词性、依存角色、兼容映射和回归样本；OEWN 词条随固定词库版本自动提供。

当前规则文件声明：

```json
{
  "schema_version": 5,
  "content_pos": ["ADJ", "ADV", "NOUN", "NUM", "PROPN", "VERB"],
  "excluded_pos": ["AUX", "CCONJ", "DET", "PART", "PRON", "SCONJ"],
  "excluded_dependencies": ["agent", "aux", "auxpass", "case", "cc", "cop", "det", "expl", "mark", "neg", "prep", "prt"],
  "lexical_pos_compatibility": {
    "a": ["ADJ"],
    "n": ["NOUN", "PROPN"],
    "r": ["ADV"],
    "s": ["ADJ"],
    "v": ["VERB"]
  },
  "combination_strategy": "nominal_phrase_first_right_fold",
  "nominal_head_pos": ["NOUN", "PROPN"],
  "nominal_premodifier_dependencies": ["advmod", "amod", "compound", "nummod", "npadvmod", "quantmod"],
  "nominal_postmodifier_object_dependencies": ["pobj"],
  "nominal_postmodifier_bridge_dependencies": ["prep"],
  "verb_particle_head_pos": ["VERB"],
  "verb_particle_dependencies": ["prt"]
}
```

### 渐进组合

所有核心仍先按原文顺序独立输出。随后脚本查找以 `NOUN` 或 `PROPN` 为中心、位于中心词左侧且依存链只经过配置关系的连续核心。每个前置修饰名词短语从中心词开始向左扩展；多个名词短语按原文从左到右输出。

例如：

```text
green spaces
more green spaces
lower speed limits
more green spaces and lower speed limits
needed more green spaces and lower speed limits
```

前置修饰结构形成后，脚本从左到右检查相邻名词组。候选名词中心必须以配置的 `pobj` 关系指向位于其左侧的非核心介词，介词再以 `prep` 关系指向已在左侧组中的名词中心；原子顺序必须是“名词中心、介词、候选名词组”。每成功吸收一个候选组，脚本就输出一个累积短语，例如 `noise from traffic` 或 `noise from traffic in cities`。介词若指向动词，则不会触发这一规则。

完成前置和后置扩展的名词短语被折叠为不可拆的组合组。其余组合仍从最右侧组向左进行，每次加入一个已经独立练过的核心或完整名词短语组。组合文本始终截取左右边界之间的原文，因此限定词、助动词、介词和连词会自动进入。

若句子有 `N` 个核心：

- 先输出 `N` 个 `core` 单元。
- 再输出名词短语内部组合：前置修饰从中心词向左扩展，简单介词后置修饰从左到右扩展；随后将完整短语折叠成组。
- 最后从右向左合并各组；一次可以增加多个已经组成短语的底层核心。
- 覆盖全部 `N` 个核心的组合由完整原句承担，不额外生成缺少句末标点的重复单元。

`core_count` 始终记录组合实际覆盖的底层实义核心数，因此短语组加入时允许跳增。一个核心仍先独立练习，再进入完整原句。

## 数据流

```mermaid
flowchart LR
    A[英文教材] --> B[分句与 token 化]
    B --> C[OEWN 最长匹配]
    B --> D[固定词性与依存分析]
    C --> E[多词 OEWN 优先<br/>连续 VERB + prt 回退]
    D --> E
    E --> F[词典、句法与上下文证据判定]
    F --> G[实义核心独立单元]
    F --> H[名词前置与简单后置修饰优先<br/>再右向折叠组合组]
    G --> I[确定性分析 JSON]
    H --> I
    I --> J[模型生成中文提示]
    J --> K[严格校验与渲染]
    K --> L[追加完整原句]
```

## 依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| Wn | `1.1.1` | 读取 WordNet 数据并提供 Morphy |
| Open English WordNet | `oewn:2025` | 单词和多词表达匹配 |
| spaCy | `3.8.7` | 固定英语分析 pipeline |
| en_core_web_sm | `3.8.0` | 上下文词性、依存角色和字符位置 |
| Click | `8.1.8` | 固定 spaCy 命令依赖的兼容版本 |

相同输入、依赖和规则产生相同英文学习单元。模型生成的中文措辞不保证逐字一致。

## 能力边界

- 当前仅将连续的 `VERB + prt` 识别为不可拆动词小品词核心；其他动词短语和从句仍使用右向折叠，不重建完整依存树。
- 名词后置修饰仅处理连续的 `pobj → prep → NOUN/PROPN` 链；关系从句、从句补语、非连续结构和并列后置修饰不在当前范围。
- 中间答案必须是原句中的连续片段；非连续表达不在当前范围。
- 固定统计模型可能产生稳定但错误的上下文分析；表层 OEWN 证据只能纠正未承担功能角色的部分误标，其余问题通过回归样本调整通用规则。
- 中文提示用于理解和教材表达复现，不表示目标英文是唯一自然表达。
- 英文答案始终来自原句字符范围，中文不能反向修改英文结构。

## 验证

测试覆盖分句、token 化、OEWN lemma/词性/匹配方式、最长非重叠选择、Morphy 词形变体、词典词性兼容、连续动词小品词回退及词典优先级、普通介词和非连续结构排除、表层命中误标兜底、功能角色优先排除、未匹配实义词补充、名词前置修饰组合、简单介词后置修饰、多个及嵌套后置修饰、动词介词补语排除、组合组右向折叠、连接成分吸收、schema 7、`head_atom` 引用与环校验、分析防篡改、中文提示严格对齐、Markdown 转义、失败不创建报告和递增文件名。真实 CLI 验收确认 `Hurry up` 通过句法回退成为单个核心、`Walk up the hill` 不会误合并，并继续覆盖 Birdsong 教材的既有行为。
