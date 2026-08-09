<script setup>
import { ref, computed } from "vue";
import Grid from "./Grid.vue";
import Image from "./Image.vue";
import { data } from "./../../blocks.data.js";
import { useData } from "vitepress";
const { theme, page } = useData();
const config = computed(() => theme.value.config || {});
const props = defineProps({ block: { type: Object, required: true } });
const donate = ref(false);

const cards = computed(() => data.fundraisings.filter((f) => f.lang === page.value.frontmatter.lang));
</script>

<template>
  <div class="fundraising container relative max-w-3xl mx-auto p-6 my-6">
    <Grid :block="{ ...props.block, elements: cards, query: false, tags: ['3d'] }" v-slot="{ item: card, index, activeIndex }">
      <div class="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        <!-- Image Section -->
        <div class="relative aspect-16/9 overflow-hidden">
          <div class="absolute inset-0 flex items-center justify-center">
            <Image :src="card.image" :index="index" :alt="card.title" class="w-full h-full object-cover" />
          </div>
        </div>

        <!-- Content Section -->
        <div class="p-3">
          <h2 class="text-2xl font-bold text-slate-900 mb-1">{{ card.name }}</h2>
          <p class="text-slate-600 mb-4">{{ card.description }}</p>

          <!-- Progress Stats -->
          <div class="mb-4" v-if="card.goal">
            <div class="flex justify-between items-baseline mb-2">
              <span class="text-lg font-bold">{{ card.raised }}€</span>
              <span class="text-slate-500 text-sm"> de {{ card.goal }}€</span>
            </div>

            <!-- Progress Bar -->
            <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-gray-200 to-accent rounded-full transition-all duration-500 ease-out" :style="{ width: `${Math.min(card.progress, 100)}%` }"></div>
            </div>

            <div class="text-sm text-slate-600 mt-2">{{ card.progress }}% finaciado</div>
          </div>
          <!-- Action Buttons -->
          <div class="flex gap-3">
            <button v-if="donate == false || index != activeIndex" @click.stop="donate = true" class="flex-1 bg-accent text-white font-semibold py-3 px-6 rounded-xl hover:shadow-lg hover:scale-101 transition-all duration-200 cursor-pointer">{{ card.action || "Donar" }}</button>

            <div v-else v-for="bank in config.bank" class="text-accent">
              <p v-if="bank.account.includes('https://')">
                <strong>{{ bank.title }}: </strong><a :href="bank.account">{{ card.action || "Donar" }}</a>
              </p>
              <p v-else>
                <strong>{{ bank.title }}: </strong>{{ bank.account }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Grid>
  </div>
</template>
