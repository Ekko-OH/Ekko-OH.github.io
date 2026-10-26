---
title: GPT 与 BERT
description: 同一套 Transformer 积木的两种搭法：decoder-only 的因果语言模型，和 encoder-only 的双向掩码模型，差的不只是方向，还有训练目标、输出形态和适用场景。
date: 2026-10-24
role: model
source: agent
order: 7
tags: [语言模型, 模型对比, Transformer]
aliases: [GPT, BERT, 模型对比]
uuid: "01a177d1-e125-796b-a067-0935a943e748"
---

> [!info] 这是「模型」层
> 主线讲的是架构为什么长成这样，专题讲的是每个部件。这一篇把部件拼成两个真实模型，看看同一套积木换一种搭法，会得到什么不同的东西。

## 一句话版本

GPT 和 BERT 用的是同一套 Transformer 块、同一套注意力和 FNN，区别主要在三个地方：**注意力能不能看右边**、**训练时预测什么**、**输出拿来做什么**。GPT 是「一直预测下一个词」的生成模型，BERT 是「把中间挖掉再还原」的表示模型。

<div class="model-split">
	<div class="model-card">
		<h4>GPT：decoder-only</h4>
		<p>单向注意力，每个位置只能看自己和左边；训练目标就是预测下一个 token。</p>
		<div class="model-flow">
			<span>token</span><span>→</span><span>Embedding</span><span>→</span><span>N × Block（因果掩码）</span><span>→</span><span>LM Head</span><span>→</span><span>下一个词</span>
		</div>
	</div>
	<div class="model-card">
		<h4>BERT：encoder-only</h4>
		<p>双向注意力，所有位置互相可见；训练目标是还原被遮住的 token。</p>
		<div class="model-flow">
			<span>token</span><span>→</span><span>Embedding</span><span>→</span><span>N × Block（双向）</span><span>→</span><span>MLM Head</span><span>→</span><span>被遮住的词</span>
		</div>
	</div>
</div>

## GPT：把「预测下一个词」做到极致

GPT 的结构就是主线最后那张图，几乎没有额外部件：

```text
token ids → Embedding + 位置 → N × 因果 Transformer Block → LM Head → Softmax
```

关键在**因果掩码**：第 $i$ 个位置只能注意到 $j \le i$。这让训练可以并行——一次前向就能得到每个位置的「下一个词」预测，损失是：

$$
\mathcal{L}_{\text{GPT}} = -\sum_{t=1}^{n} \log p_\theta(x_t \mid x_{<t})
$$

每个 token 都贡献一个损失，监督信号非常密集。推理时从第一个 token 开始，每次采样一个，追加到输入后面，再预测下一个。

GPT-1（2018）只有 1.17 亿参数，GPT-2（2019）到 15 亿，GPT-3（2020）到 1750 亿：

| | GPT-1 | GPT-2 | GPT-3 |
| --- | --- | --- | --- |
| 参数量 | 117M | 1.5B | 175B |
| 层数 | 12 | 48 | 96 |
| $d$ | 768 | 1600 | 12288 |
| 头数 | 12 | 25 | 96 |
| 上下文 | 512 | 1024 | 2048 |

GPT-3 的论文重点不是架构创新，而是**规模**：同一个 next-token 目标，参数和数据足够大之后，模型开始表现出少样本学习（few-shot）能力——给几个例子，它就能照着做，不需要改参数。

## BERT：把「填空」做成预训练任务

BERT 把 Transformer 的**编码器**单独拿出来，去掉因果掩码，让每个位置都能看到左右两边。但这样就不能做「预测下一个词」了——每个位置都看得到答案。

于是它换了一个训练目标：**Masked Language Modeling（MLM）**。随机遮住输入里 15% 的 token，让模型根据上下文还原：

```text
输入：今天 天气 [MASK] 好
目标：预测 [MASK] = 真
```

因为要同时看左右，模型必须理解句法和语义，而不是只学「往右接」。BERT 还加了一个辅助任务 NSP（Next Sentence Prediction），判断两句话是不是连续的；后来的研究（RoBERTa 等）发现 NSP 作用不大，MLM 才是关键。

| | BERT-base | BERT-large |
| --- | --- | --- |
| 参数量 | 110M | 340M |
| 层数 | 12 | 24 |
| $d$ | 768 | 1024 |
| 头数 | 12 | 16 |
| 最大长度 | 512 | 512 |

BERT 的输出不是词表分布，而是每个 token 的上下文向量。要做分类，就在 `[CLS]` 位置上接一个线性层；要做序列标注，就在每个位置接分类头。它把「预训练 + 微调」这套范式推成了主流。

> [!note] BERT 不能直接拿来聊天
> 它的注意力是双向的，训练目标也不是自回归的。你当然可以强行让它逐个生成，但它没有学过「给定前文续写」这件事，效果不会好。生成是 GPT 这类因果模型的主场。

## 只改掩码，会发生什么

把同一份数据、同一套块分别训练：

| | 因果掩码（GPT） | 双向（BERT） |
| --- | --- | --- |
| 每个位置能看到 | 自己和左边 | 所有位置 |
| 训练目标 | 预测下一个 token | 还原被遮住的 token |
| 监督密度 | 每个位置都有 loss | 只有约 15% 的位置有 loss |
| 自然输出 | 下一个词的概率 | 上下文表示 |
| 擅长 | 生成、对话、续写 | 分类、抽取、检索向量 |

「只改掩码」之所以影响这么大，是因为它改变了**模型被要求做的事**。因果模型必须把「接下来会发生什么」编码进表示；双向模型只需要把「这个词在句子里是什么意思」编码进去。前者天然适合生成，后者天然适合理解。

## 为什么现在的 LLM 几乎都是 decoder-only

2020 年之后，主流大模型（GPT-3、PaLM、LLaMA、Qwen、DeepSeek 等）基本都是 decoder-only。原因不是「encoder 没用」，而是几个现实因素叠加：

1. **训练信号更密**：每个 token 都贡献 loss，而 MLM 只有 15% 的位置贡献。同样 token 预算下，因果模型学得更充分。
2. **预训练和推理一致**：训练时学「给定前文预测下一个」，推理时也是这件事。不需要为下游任务设计新的头。
3. **生成是通用接口**：对话、代码、工具调用、推理，都可以表示成「续写一段 token」。一个自回归目标覆盖了所有任务形态。
4. **上下文学习**：规模上来之后，few-shot 能力在 decoder-only 上表现得特别好，不需要微调就能切换任务。
5. **工程生态**：KV Cache、采样、流式输出、推测解码，都是围绕自回归生成成熟起来的。

但这不意味着 encoder 被淘汰了：

- **检索 / 嵌入模型**：很多 embedding 模型仍然是 BERT 风格的 encoder，双向注意力对「把一句话压成一个好向量」很有用。
- **分类 / NER / 抽取**：在标注数据有限时，encoder + 微调仍然是很强的基线。
- **编码器-解码器**：翻译、摘要这类「输入一段、输出一段」的任务，T5、BART 这类结构仍然合适。

更准确的说法是：**decoder-only 成了通用生成的主干，encoder 退到了它更擅长的表示任务里。**

## 第三种搭法：encoder-decoder

T5、BART 把两边都用上：encoder 双向读输入，decoder 因果地生成输出，中间用交叉注意力连接。它适合「输入和输出明显是两段」的任务：

```text
输入（源语言） → Encoder（双向） → 表示
                                    ↓ 交叉注意力
输出（目标语言） ← Decoder（因果） ← 已生成的词
```

T5 把所有任务都改写成「文本到文本」：翻译是 `translate English to German: ...`，分类是 `classify: ...`。这是一种很统一的设计，但在开放式对话和超大规模预训练上，decoder-only 更简单、更容易扩展。

## 怎么读一个模型的名字

看到 `Llama-3-70B`、`Qwen2.5-7B-Instruct`、`BERT-base` 这类名字，可以拆成三部分：

- **家族 / 版本**：Llama-3、Qwen2.5、BERT。
- **规模**：70B ≈ 700 亿参数；7B ≈ 70 亿；base/large 是 BERT 时代的小/大两档。
- **对齐 / 用途**：`Instruct`、`Chat` 通常表示做过指令微调或对话对齐；裸模型是基座模型。

参数量不等于能力，数据质量、训练 token 数、对齐方式都会影响最终表现。但在同一家族、同一代里，规模通常是最强的单一预测因子。

## 回到主线

GPT 和 BERT 把主线的部件重新组合了一遍。回看时，可以沿着这些线跳回去：

- 为什么 GPT 只需要 causal mask → [[注意力机制]]
- 为什么 BERT 能双向、GPT 不能 → 同上，重点看「因果掩码」一节
- 两种模型都要的块结构 → [[Transformer 块]]
- 输出端怎么采样 → [[Softmax 与采样]]
- 输入怎么变成向量 → [[词嵌入]]

如果只记一句话：**GPT 和 BERT 的差别不是「谁更强」，而是「被要求做什么」；架构只是载体，训练目标决定了模型最终擅长什么。**

回到主线：[[语言模型问题定义和架构|LLM 总览]]
