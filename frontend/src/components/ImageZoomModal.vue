<template>
  <Teleport to="body">
    <div v-if="showModal" class="image-modal-overlay" @click="closeModal">
      <button class="image-modal-close" @click="closeModal">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="image-modal-content" @click.stop>
        <img :src="imageUrl" alt="Zoomed image" class="image-modal-img" />
      </div>
    </div>
  </Teleport>
</template>

<script>
export default {
  name: 'ImageZoomModal',
  data() {
    return {
      showModal: false,
      imageUrl: '',
    }
  },
  mounted() {
    // Lắng nghe event mở modal
    window.addEventListener('open-image-modal', this.handleOpenModal)
    // Lắng nghe ESC để đóng modal
    window.addEventListener('keydown', this.handleKeydown)
  },
  beforeUnmount() {
    window.removeEventListener('open-image-modal', this.handleOpenModal)
    window.removeEventListener('keydown', this.handleKeydown)
  },
  methods: {
    handleOpenModal(event) {
      this.imageUrl = event.detail.imageUrl
      this.showModal = true
    },
    closeModal() {
      this.showModal = false
      // Delay để animation chạy xong
      setTimeout(() => {
        this.imageUrl = ''
      }, 300)
    },
    handleKeydown(event) {
      if (event.key === 'Escape' && this.showModal) {
        this.closeModal()
      }
    },
  },
}
</script>

<style scoped>
/* Image Modal */
.image-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.image-modal-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-modal-img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  animation: zoomIn 0.3s ease;
}

@keyframes zoomIn {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.image-modal-close {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: background 0.2s ease, transform 0.2s ease;
  z-index: 10001;
  backdrop-filter: blur(10px);
}

.image-modal-close:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.image-modal-close svg {
  width: 24px;
  height: 24px;
}
</style>

