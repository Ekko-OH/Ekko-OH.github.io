---
title: Softmax 与采样
description: logits 怎么变成词表上的概率，温度、top-k、top-p 分别改了什么，以及为什么模型「输出一个词」其实是一次采样。
date: 2026-10-24
role: topic
source: agent
order: 6
tags: [语言模型, 概率, 采样]
aliases: [Softmax, 采样, Temperature, Top-p]
---

> [!info] 在主线的哪一步
> 这是主线「输出端」的展开。主线只需要知道：模型最后输出的是一整个词表上的概率分布，不是一个词。这一篇解释分布怎么来、怎么从里面选，以及那些「temperature」「top-p」参数到底在动哪里。

## 一句话版本

模型最后一层给出每个词的 **logit**（未归一化的分数），Softmax 把它变成概率分布；训练时用这个分布算交叉熵，推理时再从分布里「选」一个词——贪心、温度采样、top-k、top-p 都是在改「怎么选」。

<figure class="prob-figure">
	<div class="prob-chart" role="img" aria-label="四个候选词的概率柱状图：好 0.81，的 0.10，了 0.07，猫 0.02">
		<div class="prob-col">
			<div class="prob-track"><span class="prob-bar" style="height:81%"></span></div>
			<div class="prob-label">好<small>0.81</small></div>
		</div>
		<div class="prob-col">
			<div class="prob-track"><span class="prob-bar" style="height:10%"></span></div>
			<div class="prob-label">的<small>0.10</small></div>
		</div>
		<div class="prob-col">
			<div class="prob-track"><span class="prob-bar" style="height:7%"></span></div>
			<div class="prob-label">了<small>0.07</small></div>
		</div>
		<div class="prob-col is-muted">
			<div class="prob-track"><span class="prob-bar" style="height:3%"></span></div>
			<div class="prob-label">猫<small>0.02</small></div>
		</div>
	</div>
	<figcaption><b>图 1</b> 「今天天气真___」下一个词的概率分布。模型并没有直接输出「好」，它输出的是这四个（以及词表里其余几万个）候选各自的概率。</figcaption>
</figure>

## 从 logits 到概率

设最后一个位置的隐藏向量是 $h \in \mathbb{R}^d$，词表矩阵是 $W_o \in \mathbb{R}^{V \times d}$，那么每个词的分数是：

$$
z = W_o h \in \mathbb{R}^{V}
$$

$z$ 叫 logits：可以是任意实数，可正可负，不加起来等于 1。Softmax 把它变成概率：

$$
p_i = \frac{\exp(z_i)}{\sum_{j=1}^{V}\exp(z_j)}
$$

它有三个性质：

1. **非负**：指数函数永远大于 0。
2. **归一化**：所有概率加起来等于 1。
3. **保序**：logit 大的词概率也大，排序不变。

Softmax 不改变「谁更可能」，只把分数翻译成可以解释为概率的数值。

## 数值稳定：先减去最大值

直接算 $\exp(z_i)$ 会溢出。如果某个 logit 是 1000，`exp(1000)` 在浮点数里就是 `inf`。标准做法是先减去最大值：

$$
p_i = \frac{\exp(z_i - \max_j z_j)}{\sum_j \exp(z_j - \max_j z_j)}
$$

因为分子分母同乘 $e^{-\max z}$，结果不变；减完之后最大的指数是 0，不会溢出。这是所有框架里 softmax 的默认实现，不需要自己手写，但值得知道它在防什么。

## 温度：把分布调尖或调平

在 Softmax 之前把 logits 除以温度 $T$：

$$
p_i(T) = \frac{\exp(z_i/T)}{\sum_j \exp(z_j/T)}
$$

- $T = 1$：原始分布。
- $T < 1$：logits 被放大，分布更尖，高概率词更容易被选中，输出更「稳」、更保守。
- $T > 1$：logits 被压平，低概率词也有机会，输出更「野」、更有创意。
- $T \to 0$：退化成 argmax（贪心）。

继续用图 1 的例子，$T=0.5$ 时「好」的概率会从 0.81 升到约 0.98；$T=2$ 时会降到 0.5 左右，其他词的机会明显变大。

> [!warning] 温度不是「创造力旋钮」
> 它只改变采样的随机性，不改变模型学到的知识。高温能让输出更多样，也会让错误更频繁；低温更稳，但容易重复、保守。真正决定「有没有好想法」的，还是模型本身和提示。

## 从分布里选词：几种常见策略

### 贪心（greedy）

每次取概率最大的词。确定、可复现，但容易陷入重复，生成的整体多样性差。

### Beam search

同时保留 $k$ 条候选序列，按累计对数概率排序，最后选总分最高的一条。机器翻译里常用；开放式生成里容易生成「安全但无聊」的文本。

### Top-k

只保留概率最高的 $k$ 个词，重新归一化后采样。$k=1$ 就是贪心。它的问题是 $k$ 固定：分布很尖时保留了一堆没用的词，分布很平时又砍掉了合理的长尾。

### Top-p（nucleus sampling）

按概率从高到低累加，凑到累计概率超过 $p$（比如 0.9）为止，只在这个「核」里采样，再重新归一化。候选集合的大小随分布形状自适应：模型很确定时集合很小，不确定时集合变大。

### 其他

- **典型采样（typical sampling）**：偏向「信息量接近期望」的词，抑制过于确定和过于意外的选择。
- **重复惩罚 / 频率惩罚**：对已经出现过的 token 降分，缓解复读。
- **约束解码**：只允许符合语法或 JSON schema 的 token，用于结构化输出。

| 策略 | 改了什么 | 适合 |
| --- | --- | --- |
| 贪心 | 只取 argmax | 确定性任务、评测 |
| Beam search | 保留多条序列 | 翻译、摘要 |
| Top-k | 固定候选数 | 通用生成，简单 |
| Top-p | 自适应候选集 | 通用生成，常用默认 |
| 温度 | 整体缩放分布 | 和上面几种组合 |

> [!note] 顺序有影响
> 常见做法是先除以温度，再做 top-k / top-p，最后采样。先截断再调温度，和先调温度再截断，结果不一样。不同框架的默认顺序可能不同，复现别人的结果时要看清。

## 训练时和推理时不是一回事

训练时，模型在每个位置都输出一个分布，损失是正确下一个词的负对数似然：

$$
\mathcal{L} = -\log p(y_t \mid y_{<t})
$$

所有位置可以并行算（teacher forcing：无论模型预测什么，下一步的输入都是真实的 token）。推理时没有真实的下一个词，只能把自己采出来的词喂回去，一个接一个生成。这个「训练时看真值、推理时看自己」的差异叫 **exposure bias**，是序列生成里的经典问题。

训练阶段**不需要采样**：交叉熵直接在整个分布上算。采样只发生在推理。很多人把「模型输出概率」和「采样策略」混为一谈，其实是两件事。

## 代码

```python
import torch

def softmax(logits: torch.Tensor, temperature: float = 1.0) -> torch.Tensor:
    z = logits / temperature
    z = z - z.max(dim=-1, keepdim=True).values  # 数值稳定
    exp = z.exp()
    return exp / exp.sum(dim=-1, keepdim=True)

def top_p_filter(probs: torch.Tensor, p: float = 0.9) -> torch.Tensor:
    sorted_probs, sorted_idx = probs.sort(descending=True)
    cumulative = sorted_probs.cumsum(dim=-1)
    # 保留累计概率刚好超过 p 的那个前缀
    keep = cumulative - sorted_probs < p
    keep[..., 0] = True
    filtered = torch.zeros_like(probs)
    filtered.scatter_(-1, sorted_idx, sorted_probs * keep)
    return filtered / filtered.sum(dim=-1, keepdim=True)
```

`torch.multinomial(probs, num_samples=1)` 就是按概率采样。实际推理引擎会把采样、惩罚、约束编译进 kernel，但逻辑就是上面这些。

## 回到主线

到这里，主线的一圈走完了：

- 输入：[[词嵌入]] + [[位置编码]]
- 混合：[[注意力机制]]
- 加工：[[前馈网络]]
- 堆叠：[[Transformer 块]]
- 输出：本篇

如果只记一句话：**模型负责给出「每个词有多可能」，采样负责决定「这次选哪个」；前者是学出来的，后者是调出来的。**

回到主线：[[语言模型问题定义和架构|LLM 总览]]
