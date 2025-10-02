<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex justify-between items-center p-4 pb-5">
      <span class="font-[700] text-[#404040] text-[16px]">Thông tin</span>
      <Button
        icon="pi pi-times"
        severity="secondary"
        text
        rounded
        size="small"
        @click="$emit('close')"
        :class="isSmallScreen ? 'text-gray-600 hover:text-gray-800' : ''"
      />
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 pt-0 space-y-6">
      <!-- Owner Section -->
      <div>
        <div class="text-[14px] font-[400] text-[#171717] mb-1">
          Chủ sở hữu
        </div>
        <div class="flex items-center space-x-[6px]">
          <CustomAvatar
            :image="entity.user_image"
            :label="getInitials(entity.full_name)"
            size="normal"
            shape="circle"
            class="bg-blue-500 text-white !w-5 !h-5"
          />
          <span class="text-[14px] font-[500] text-[#171717]">
            {{ entity.full_name || entity.owner }}
          </span>
        </div>
      </div>

      <!-- Shared With Section -->
      <div
        v-if="entity.owner === userId && usersPermission?.length > 0"
      >
        <div class="text-[14px] font-[400] text-[#171717] mb-1">
          Người có quyền truy cập
        </div>
        <div class="flex flex-wrap items-center gap-[6px]">
          <div
            class="flex items-center"
            v-for="(user, index) in usersPermission?.slice(0, 2)"
            :key="user?.user_name"
          >
            <div class="flex items-center space-x-[6px]">
              <CustomAvatar
                :label="getInitials(user.full_name || user.user)"
                :image="user.user_image"
                size="normal"
                shape="circle"
                class="bg-blue-500 text-white -ml-1 border-2 border-white !w-5 !h-5"
              />
              <span class="text-[14px] font-[500] text-[#171717]">
                {{ user.full_name || user.user }}
              </span>
            </div>
            <span
              v-if="index === 0 && usersPermission?.length > 2"
              class="text-sm text-gray-600"
            >
              ,
            </span>
          </div>
          <span
            v-if="usersPermission?.slice(2).length > 0"
            class="text-sm text-gray-600 ml-2"
          >
            và {{ usersPermission.slice(2).length }} người khác
          </span>
        </div>
      </div>

      <!-- Tags Section -->
      <div v-if="userId !== 'Guest'">
        <div class="text-[14px] font-[400] text-[#171717] mb-1">Nhãn</div>
        <TagInput class="w-full" :entity="entity" />
      </div>

      <!-- Properties Section -->
      <div>
        <div class="space-y-4">
          <div>
            <p class="text-[14px] font-[400] text-[#171717] mb-1">Loại</p>
            <p class="text-[14px] font-[500] text-[#171717] mb-1">
              {{ getFileTypeVi(entity.file_type) }}
            </p>
          </div>
          <div>
            <p class="text-[14px] font-[400] text-[#171717] mb-1">Kích thước</p>
            <p class="text-[14px] font-[500] text-[#171717] mb-1">
              {{ entity.file_size_pretty }}
            </p>
          </div>
          <div>
            <p class="text-[14px] font-[400] text-[#171717] mb-1">
              Lần sửa đổi gần nhất
            </p>
            <p class="text-[14px] font-[500] text-[#171717] mb-1">
              {{ formatDateVi(entity.modified) }} do
              {{ entity.owner === userId ? "tôi" : entity.owner }}
              thực hiện
            </p>
          </div>
          <div>
            <p class="text-[14px] font-[400] text-[#171717] mb-1">Ngày tạo</p>
            <p class="text-[14px] font-[500] text-[#171717] mb-1">
              {{ formatDateVi(entity.creation) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import TagInput from "@/components/TagInput.vue"
import Button from "primevue/button"
import { computed } from "vue"
import { useStore } from "vuex"
import CustomAvatar from "../CustomAvatar.vue"

const props = defineProps({
  entity: {
    type: Object,
    required: true,
  },
  usersPermission: {
    type: Array,
    default: () => [],
  },
  isSmallScreen: {
    type: Boolean,
    default: false,
  },
})

defineEmits(["close"])

const store = useStore()
const userId = computed(() => store.state.user.id)

function getInitials(name) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getFileTypeVi(type) {
  if (!type) return ""
  const map = {
    pdf: "Tệp PDF",
    doc: "Tài liệu Word",
    docx: "Tài liệu Word",
    xls: "Bảng tính Excel",
    xlsx: "Bảng tính Excel",
    ppt: "Bản trình chiếu PowerPoint",
    pptx: "Bản trình chiếu PowerPoint",
    jpg: "Ảnh JPG",
    jpeg: "Ảnh JPG",
    png: "Ảnh PNG",
    gif: "Ảnh GIF",
    txt: "Tệp văn bản",
    csv: "Tệp CSV",
    zip: "Tệp nén ZIP",
    rar: "Tệp nén RAR",
    mp3: "Âm thanh MP3",
    mp4: "Video MP4",
    folder: "Thư mục",
    image: "Hình ảnh",
  }
  return map[type?.toLowerCase()] || type
}

function formatDateVi(date) {
  if (!date) return ""
  const d = new Date(date)
  const day = d.toLocaleDateString("vi-VN")
  const time = d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${day} ${time}`
}
</script>