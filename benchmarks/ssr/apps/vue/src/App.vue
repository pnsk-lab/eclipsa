<script setup>
import { createData } from '../../../data'

const items = createData()
</script>

<template>
  <div>
    <div v-for="item in items" :key="item.id">
      <h3>{{ item.name }}</h3>
      <p>{{ item.value }}</p>
    </div>
  </div>
</template>
