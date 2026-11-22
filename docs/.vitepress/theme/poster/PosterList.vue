<script setup>
// Body of the event-type poster (PosterMode.vue draws the picture, brand and footer around it):
// one row per event with its next date (or weekday), time + place on one line and a short
// description. `scale` shrinks the rows when there are many.
defineProps({ title: String, items: Array, showDescription: Boolean, scale: { type: Number, default: 1 }, bilingual: Boolean });
</script>

<template>
  <section class="pz-body pz-listbody">
    <h1 class="pz-title">{{ title }}</h1>
    <ul class="pz-rows" :style="{ '--ls': scale }">
      <li v-for="it in items" :key="it.key" class="pz-row">
        <div class="pz-when">
          <template v-if="it.day"><b>{{ it.day.day }}</b><span>{{ it.day.month }}</span><i v-if="it.day.more">+{{ it.day.more }}</i></template>
          <em v-else>{{ it.recurrence }}</em>
        </div>
        <div class="pz-what">
          <strong>{{ it.title }}<span v-if="it.title2" class="pz-soft"> / {{ it.title2 }}</span></strong>
          <span v-if="it.whenLine" class="pz-line">{{ it.whenLine }}</span>
          <template v-if="showDescription">
            <p v-if="it.description" class="pz-rowdesc">{{ it.description }}</p>
            <p v-if="bilingual && it.description2" class="pz-rowdesc pz-soft">{{ it.description2 }}</p>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>
