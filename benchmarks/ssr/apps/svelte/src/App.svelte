<script>
  import { createData } from '../../../data';

  const items = createData();
</script>

<div>
  {#each items as item (item.id)}
    <div>
      <h3>{item.name}</h3>
      <p>{item.value}</p>
    </div>
  {/each}
</div>
