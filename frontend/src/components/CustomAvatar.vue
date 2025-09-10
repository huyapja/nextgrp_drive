<template>
    <Avatar v-if="image" :image="image" :size="size" :shape="shape" />
    <Avatar
        v-else
        :label="label"
        :size="size"
        :shape="shape"
        :class="randomBgClass + ' text-white'"
    />
</template>
<script setup>
import Avatar from 'primevue/avatar';
import { computed } from 'vue';

const props = defineProps({
  label: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'normal' // small, normal, large
  },
  shape: {
    type: String,
    default: 'circle' // circle, square
  }
})

const randomBgClass = computed(() => {
  const colors = [
    'bg-red-500', 'bg-green-500', 'bg-blue-500', 'bg-yellow-500',
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
    'bg-orange-500', 'bg-cyan-500', 'bg-lime-500', 'bg-amber-500'
  ];
  if (props.label) {
    const charCode = props.label.charCodeAt(0);
    return colors[charCode % colors.length];
  }
  return colors[Math.floor(Math.random() * colors.length)];
});

</script>