<script setup>
defineProps({
  title: { type: String, default: '功能演示' },
  description: { type: String, default: '该菜单已按截图完成导航占位，功能将在后续迭代补齐。' },
})
</script>

<template>
  <section class="demo-page">
    <div class="card">
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
  </section>
</template>

<style scoped>
.demo-page {
  min-width: 0;
  padding: 24px 28px 32px;
}

.card {
  border: 1px dashed var(--kd-line);
  border-radius: 12px;
  background: var(--kd-surface);
  padding: 22px;
}

h2 {
  margin: 0;
  font-size: 22px;
}

p {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--kd-text-soft);
}
</style>
