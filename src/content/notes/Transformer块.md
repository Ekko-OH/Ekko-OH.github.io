---
title: Transformer 块
description: 把 Attention、FNN、残差和 LayerNorm 装成一个可以重复 N 次的块：Pre-LN 与 Post-LN 的差别，12d² 的参数从哪来，以及「堆深」到底靠什么成立。
date: 2026-10-24
role: topic
source: agent
order: 5
tags: [Transformer, 架构, 神经网络]
aliases: [Transformer Block, Transformer, 残差连接]
uuid: "01a177d1-e128-72e1-a3cf-075434d1d19a"
---

> [!info] 在主线的哪一步
> 这是主线「第 4 步：把部件装进可堆叠的块」的展开。到这一步，词向量、注意力、前馈网络、位置编码都已经就位；剩下的问题是怎么把它们稳定地叠几十层。

## 一句话版本

一个 Transformer 块 = 两个子层，每个子层都包着「归一化 → 算子 → 残差相加」：

$$
h = x + \operatorname{MHA}(\operatorname{LN}(x)),
\qquad
y = h + \operatorname{FNN}(\operatorname{LN}(h))
$$

把块重复 $N$ 次，再接一个输出头，就是 GPT、LLaMA 这类模型的主干。残差和归一化不是附属品，它们是把网络堆深的**前提**。

<figure class="arch-figure">
	<div class="tblock">
		<div class="tblock-row">
			<span class="tblock-box">x</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-box">LayerNorm</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-box is-accent">多头注意力</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-add">+</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-box">h</span>
		</div>
		<div class="tblock-row"><span class="tblock-residual">残差：x 不经过子层，直接加到 ⊕</span></div>
		<div class="tblock-row">
			<span class="tblock-box">h</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-box">LayerNorm</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-box is-accent">前馈网络</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-add">+</span>
			<span class="tblock-arrow">→</span>
			<span class="tblock-box">y</span>
		</div>
		<div class="tblock-row"><span class="tblock-residual">残差：h 不经过子层，直接加到 ⊕</span></div>
	</div>
	<figcaption><b>图 1</b> Pre-LN 版本的一个 Transformer 块。两个子层各有一条残差旁路；归一化放在子层之前，这是现在大多数模型的默认选择。</figcaption>
</figure>

## 为什么需要残差

朴素地堆层会遇到两个问题：

1. **梯度消失**：反向传播要穿过每一层的雅可比矩阵，层数一多，梯度要么趋近 0，要么爆炸。
2. **表示退化**：每层都强行改写表示，深层很难保留浅层学到的有用信息。

残差连接把子层的输出改成「子层结果 + 原输入」：

$$
h = x + f(x)
$$

反向传播时，梯度里始终有一条 $\partial h / \partial x = I + \partial f/\partial x$ 的直接通路。即使 $f$ 的梯度很小，恒等项也能把梯度传回去。前向时，如果某一层没学到东西，它至少可以把输入原样传下去——最坏情况是「什么都不做」，而不是「把表示弄坏」。

> [!tip] 残差流（residual stream）
> 可以把主干看成一条贯穿所有层的「残差流」：Attention 从里面读信息、把结果加回去；FNN 也读、也加。每一层只是对这条流做一次增量修改。这个视角在可解释性研究里很常用，也能解释为什么不同层的表示可以相对平滑地演化。

## 为什么需要 LayerNorm

深度网络里，每层的输入分布会随着前面参数更新而漂移（内部协变量偏移）。LayerNorm 把每个 token 的 $d$ 个特征重新标准化：

$$
\operatorname{LN}(x) = \gamma \odot \frac{x-\mu}{\sqrt{\sigma^2+\epsilon}} + \beta
$$

其中 $\mu$、$\sigma^2$ 是**这一个 token 的所有特征**上的均值和方差，$\gamma$、$\beta$ 是可学习的缩放和偏移。

它和 BatchNorm 的关键区别：

| | BatchNorm | LayerNorm |
| --- | --- | --- |
| 统计维度 | 一个 batch 内、同一特征 | 单个样本内、所有特征 |
| 依赖 batch | 是 | 否 |
| 变长序列 | 处理麻烦 | 天然适配 |
| 推理行为 | 用滑动统计量 | 和训练一致 |

语言模型 batch 内序列长度不一、推理时 batch 可能为 1，LayerNorm 因此更合适。

后来很多模型换成了 **RMSNorm**：去掉减均值，只除以均方根：

$$
\operatorname{RMSNorm}(x) = \gamma \odot \frac{x}{\sqrt{\operatorname{mean}(x^2)+\epsilon}}
$$

它少一次归约、少一组参数，效果通常接近，LLaMA 系列用的就是它。

## Pre-LN 与 Post-LN

原版 Transformer 把归一化放在残差**之后**：

$$
h = \operatorname{LN}(x + \operatorname{MHA}(x)),
\qquad
y = \operatorname{LN}(h + \operatorname{FNN}(h))
$$

这叫 Post-LN。它在浅层任务上表现很好，但深层训练容易不稳，通常需要小心地调学习率 warmup，否则早期梯度会炸。

后来的模型普遍改成 Pre-LN：归一化放在子层**之前**，残差通路保持干净：

$$
h = x + \operatorname{MHA}(\operatorname{LN}(x)),
\qquad
y = h + \operatorname{FNN}(\operatorname{LN}(h))
$$

| | Post-LN | Pre-LN |
| --- | --- | --- |
| 归一化位置 | 残差相加之后 | 子层输入之前 |
| 深层稳定性 | 较差，依赖 warmup | 较好，训练更稳 |
| 残差通路 | 被 LN 打断 | 从输入直通输出 |
| 代表 | 原版 Transformer | GPT-2 之后的绝大多数模型 |

Pre-LN 的代价是最后通常要再加一个 LayerNorm，把输出尺度收回来，再接 LM Head。

## 一个块有多少参数

忽略 bias 和归一化的小参数，一个块的主要参数是：

| 子层 | 参数量（约） |
| --- | --- |
| 多头注意力：$W_Q, W_K, W_V, W_O$ | $4d^2$ |
| 前馈网络：$d \to 4d \to d$ | $8d^2$ |
| 合计 | $12d^2$ |

GPT-3 的 $d = 12288$，一层约 $12 \times 12288^2 \approx 18.1$ 亿参数；堆 96 层约 1740 亿——再加上 Embedding 和输出头，正好凑到 1750 亿。这就是「175B」的主要来源。

> [!note] 参数量不是唯一成本
> 训练和推理的 FLOPs 大致与「参数量 × token 数」成正比；显存还要放激活、优化器状态和 KV Cache。一个 7B 模型用 FP16 存权重约 14GB，但训练时加上梯度和 Adam 状态会翻好几倍。

## 堆叠之后：从块到模型

一个 decoder-only 语言模型的主干可以写成：

```text
token ids
  → Embedding
  → + 位置信息
  → N × Transformer Block
  → 最终 LayerNorm
  → LM Head（d → 词表）
  → Softmax
```

几个实现上的细节：

- **位置信息**：正弦编码或可学习位置在进入第一个块之前加；RoPE 则在每个块的注意力内部旋转 Q/K。
- **权重共享**：LM Head 可以和输入 Embedding 共用矩阵，减少参数。
- **并行块**：有些模型（如 GPT-J）把 Attention 和 FNN 放在同一层并行计算，再相加，减少串行依赖；数学上不再是严格的「先 A 后 B」，但通常也能训练得很好。
- **MoE**：把 FNN 换成多个专家，按 token 路由，见 [[前馈网络]]。

## 代码：一个 Pre-LN 块

```python
import torch
import torch.nn as nn

class Block(nn.Module):
    def __init__(self, d_model: int, n_heads: int, mult: float = 4.0):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.ln2 = nn.LayerNorm(d_model)
        hidden = int(d_model * mult)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, hidden),
            nn.GELU(),
            nn.Linear(hidden, d_model),
        )

    def forward(self, x, attn_mask=None):
        # Pre-LN：归一化在子层之前，残差通路保持干净
        h = x + self.attn(self.ln1(x), self.ln1(x), self.ln1(x),
                          attn_mask=attn_mask, need_weights=False)[0]
        y = h + self.ffn(self.ln2(h))
        return y
```

实际实现会把 Q/K/V 投影合并成一个矩阵、用融合的注意力 kernel、把 LayerNorm 换成 RMSNorm，但骨架就是这十几行。

## 回到主线

到这里，主线的四个部件都齐了：

- [[词嵌入]]：把 token 变成向量
- [[前馈网络]]：逐位置加工
- [[注意力机制]]：跨位置混合
- [[位置编码]]：把顺序补回来
- 本篇：把它们装成可堆叠的块

还剩最后一步：块输出的隐藏向量怎么变成「下一个词」的概率 → [[Softmax 与采样]]

如果只记一句话：**Transformer 块的价值不在单个算子，而在「残差 + 归一化 + 固定结构」让同一套积木可以安全地堆几十层；深度本身就是能力。**

回到主线：[[语言模型问题定义和架构|LLM 总览]]
