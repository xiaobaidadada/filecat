import React, {useEffect, useRef, useState} from 'react';
import Chart from 'chart.js/auto';



const CircleChart = ({ percentage }) => {
    const chartRef = useRef(null);
    const [chart,setChart] = useState(null);
    useEffect (()=>{
        const ctx = chartRef.current.getContext('2d');
        // 创建 Chart.js 实例
        const c = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['use', 'left'],
                datasets: [
                    {
                        data: [percentage, 100 - percentage], // 这里只有一个数据项，表示进度
                        backgroundColor: ['#007bff', '#f0f0f0'], // 蓝色表示进度，灰色表示剩余
                        borderWidth: 0, // 去掉边框
                    },
                ],
            },
            options: {
                plugins: {
                    legend: {
                        display: false, // 不显示图例
                    },
                    tooltip: {
                        enabled: false, // 提示文字
                    },
                },
                elements: {
                    arc: {
                        borderWidth: 0, // 去掉饼图的边框
                    },
                },

            },

        });
        setChart(c)
        return ()=>{
            c.destroy();
        }
    },[])
    useEffect(() => {
       if (chart) {
           chart.data.datasets[0].data = [percentage,100-percentage]
           chart.update()
       }
    }, [percentage]);

    return <div style={{
        width: '8rem',
        overflow: "hidden"
    }}>
        <canvas ref={chartRef}/>
    </div>;
};

export default CircleChart;
