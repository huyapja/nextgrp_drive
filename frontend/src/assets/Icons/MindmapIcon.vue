<template>
  <svg 
    :width="size || 20" 
    :height="size || 20" 
    viewBox="0 0 48 48" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="48" height="48" fill="white" fill-opacity="0.01"/>
    <path 
      d="M26 24L42 24" 
      :stroke="stroke || 'currentColor'" 
      stroke-width="4" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    />
    <path 
      d="M26 38H42" 
      :stroke="stroke || 'currentColor'" 
      stroke-width="4" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    />
    <path 
      d="M26 10H42" 
      :stroke="stroke || 'currentColor'" 
      stroke-width="4" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    />
    <path 
      d="M18 24L6 24C6 24 7.65685 24 10 24M18 38C12 36 16 24 10 24M18 10C12 12 16 24 10 24" 
      :stroke="stroke || 'currentColor'" 
      stroke-width="4" 
      stroke-linecap="round" 
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup>
defineProps({
  size: {
    type: Number,
    default: 20
  },
  stroke: {
    type: String,
    default: 'currentColor'
  }
})
</script>

